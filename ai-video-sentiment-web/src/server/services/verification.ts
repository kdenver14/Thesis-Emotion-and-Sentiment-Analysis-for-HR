import "server-only";
import bcrypt from "bcryptjs";
import { env } from "~/env";
import { db } from "~/server/db";
import { passwordSchema } from "~/schemas/auth";
import { recordAudit } from "~/server/repositories/audit";
import {
  consumeToken,
  issueToken,
  issueCode,
  peekToken,
  verifyCode,
  TokenRateLimitError,
  type CodeResult,
} from "~/server/repositories/verificationToken";
import { revokeAllForUser } from "~/server/repositories/trustedDevice";
import { sendMail } from "~/server/mail/mailer";
import {
  loginCodeTemplate,
  resetPasswordTemplate,
  stepUpCodeTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
} from "~/server/mail/templates";

// Business logic only. No nodemailer, no token hashing here: those live in the
// mail boundary and the token repository respectively.

const BCRYPT_ROUNDS = 12;

function linkFor(path: string, rawToken: string): string {
  return `${env.APP_URL}${path}?token=${encodeURIComponent(rawToken)}`;
}

// Issues a verification token and emails the link. With `tempPassword` (new
// admin-created account) the email is the welcome email carrying it. Throws
// on send failure so the caller can decide whether that is fatal (createUser
// treats it as a non-fatal warning; resend surfaces it generically).
export async function sendVerificationEmail(
  userId: string,
  tempPassword?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true },
  });
  if (!user?.email || user.emailVerified) return;

  const raw = await issueToken("verify", userId);
  const url = linkFor("/verify-email", raw);
  const email = tempPassword
    ? welcomeTemplate({ name: user.name, url, tempPassword })
    : verifyEmailTemplate({ name: user.name, url });
  await sendMail({ to: user.email, ...email });
}

export async function confirmEmail(
  rawToken: string,
): Promise<{ ok: boolean; alreadyVerified: boolean }> {
  const bound = await consumeToken(rawToken);
  if (!bound || bound.purpose !== "verify") {
    return { ok: false, alreadyVerified: false };
  }

  const user = await db.user.findUnique({
    where: { id: bound.userId },
    select: { name: true, emailVerified: true },
  });
  if (!user) return { ok: false, alreadyVerified: false };
  if (user.emailVerified) return { ok: true, alreadyVerified: true };

  await db.user.update({
    where: { id: bound.userId },
    data: { emailVerified: new Date() },
  });
  await recordAudit({
    actorId: bound.userId,
    actorName: user.name ?? "(unknown)",
    action: "user.email_verified",
    targetType: "user",
    targetId: bound.userId,
    targetName: user.name,
  });
  return { ok: true, alreadyVerified: false };
}

// Generic by contract: callers must return the same response whether or not a
// matching account exists (no account enumeration). Rate-limit is swallowed
// here for the same reason.
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, password: true },
  });
  if (!user?.email || !user.password) return;

  try {
    const raw = await issueToken("reset", user.id);
    const mail = resetPasswordTemplate({
      name: user.name,
      url: linkFor("/reset-password", raw),
    });
    await sendMail({ to: user.email, ...mail });
  } catch (error) {
    if (error instanceof TokenRateLimitError) return;
    throw error;
  }
}

// For the reset page: lets it say a link is dead when it opens, instead of
// after the user has typed a new password.
export async function isResetLinkUsable(rawToken: string): Promise<boolean> {
  return (await peekToken(rawToken))?.purpose === "reset";
}

export async function resetPassword(
  rawToken: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }

  const bound = await consumeToken(rawToken);
  if (!bound || bound.purpose !== "reset") {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const user = await db.user.findUnique({
    where: { id: bound.userId },
    select: { name: true },
  });
  if (!user) {
    return { ok: false, error: "This reset link is invalid or has expired." };
  }

  const hashed = await bcrypt.hash(parsed.data, BCRYPT_ROUNDS);
  await db.user.update({
    where: { id: bound.userId },
    // A reset sets a password of their own, so it also ends a pending
    // temporary-password change.
    data: { password: hashed, mustChangePassword: false },
  });
  // A credential rotation must evict every remembered device: an attacker
  // who triggered the reset (or had a trusted device) loses 2FA bypass.
  await revokeAllForUser(bound.userId);
  await recordAudit({
    actorId: bound.userId,
    actorName: user.name ?? "(unknown)",
    action: "user.password_reset",
    targetType: "user",
    targetId: bound.userId,
    targetName: user.name,
  });
  return { ok: true };
}

// Step-up: emails a 6-digit code to the signed-in user before they may change
// their password. Caller has already re-checked the current password, so a
// missing-email case is a real error worth surfacing (not generic).
export async function sendPasswordChangeCode(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!user?.email) {
    return { ok: false, error: "No email address on file for this account." };
  }

  try {
    const code = await issueCode("pwchange", userId);
    const mail = stepUpCodeTemplate({ name: user.name, code });
    await sendMail({ to: user.email, ...mail });
    return { ok: true };
  } catch (error) {
    if (error instanceof TokenRateLimitError) {
      return {
        ok: false,
        error: "Please wait a minute before requesting another code.",
      };
    }
    throw error;
  }
}

export async function verifyPasswordChangeCode(
  userId: string,
  code: string,
): Promise<CodeResult> {
  return verifyCode("pwchange", userId, code);
}

// Login 2FA: emails a 6-digit code. Caller has already verified email +
// password, so a missing-email case is a real (non-generic) error. Rate
// limit collapses to a friendly wait message (the user is mid-login, not
// enumerating).
export async function sendLoginCode(
  userId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });
  if (!user?.email) {
    return { ok: false, error: "No email address on file for this account." };
  }

  try {
    const code = await issueCode("login", userId);
    const mail = loginCodeTemplate({ name: user.name, code });
    await sendMail({ to: user.email, ...mail });
    return { ok: true };
  } catch (error) {
    if (error instanceof TokenRateLimitError) {
      return {
        ok: false,
        error: "Please wait a minute before requesting another code.",
      };
    }
    throw error;
  }
}

export async function verifyLoginCode(
  userId: string,
  code: string,
): Promise<CodeResult> {
  return verifyCode("login", userId, code);
}
