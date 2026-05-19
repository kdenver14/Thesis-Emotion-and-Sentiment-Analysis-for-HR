"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { env } from "~/env";
import { db } from "~/server/db";
import {
  requestPasswordReset as requestPasswordResetService,
  resetPassword as resetPasswordService,
  sendLoginCode,
  sendVerificationEmail,
  verifyLoginCode as verifyLoginCodeService,
} from "~/server/services/verification";
import { issueToken } from "~/server/repositories/verificationToken";
import {
  issueTrustedDevice,
  TRUSTED_DEVICE_TTL_MS,
  validateTrustedDevice,
} from "~/server/repositories/trustedDevice";
import { TRUST_COOKIE } from "~/server/auth/config";

const emailSchema = z.string().trim().toLowerCase().email();

// Status the /login client routes on. "invalid" stays generic (parity with
// the existing signIn() "Invalid email or password" copy); "unverified"
// keeps the existing resend-verification UX path.
export type LoginStep =
  | "code_sent"
  | "trusted"
  | "unverified"
  | "invalid"
  | "error";

// Step 1 of login 2FA. Re-validates credentials at the boundary (this is a
// public RPC, not just a UX helper), then decides the next client step:
// already-trusted device, emailed code, unverified account, or generic
// rejection. authorize() still enforces every one of these server-side; this
// only drives the UI and triggers the code email.
export async function requestLoginCode(
  email: string,
  password: string,
): Promise<{ step: LoginStep; error?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { step: "invalid" };

  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, email: true, password: true, emailVerified: true },
  });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return { step: "invalid" };
  }
  if (!user.emailVerified) return { step: "unverified" };

  const trust = (await cookies()).get(TRUST_COOKIE)?.value;
  if (trust && (await validateTrustedDevice(trust, user.id))) {
    return { step: "trusted" };
  }

  const sent = await sendLoginCode(user.id);
  return sent.ok ? { step: "code_sent" } : { step: "error", error: sent.error };
}

// Step 2 of login 2FA. Re-validates credentials again (the code is not the
// only gate), checks the emailed code, and on success mints a single-use
// 90s proof for signIn(). "Remember me" additionally persists a 30-day
// trusted-device record + cookie so future logins skip the code.
export async function verifyLoginCode(
  email: string,
  password: string,
  code: string,
  remember: boolean,
): Promise<{ ok: boolean; error?: string; proof?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: "Invalid email or password" };

  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, password: true, emailVerified: true },
  });
  if (!user?.password || !(await bcrypt.compare(password, user.password))) {
    return { ok: false, error: "Invalid email or password" };
  }
  if (!user.emailVerified) {
    return { ok: false, error: "Invalid email or password" };
  }

  // Reject malformed input before it burns one of the 5 attempts (stale
  // autofill / buggy client must not self-DoS the user's quota).
  if (!/^\d{6}$/.test(code)) return { ok: false, error: "Incorrect code." };

  const result = await verifyLoginCodeService(user.id, code);
  if (result !== "ok") {
    return {
      ok: false,
      error:
        result === "expired"
          ? "Code expired. Request a new one."
          : result === "locked"
            ? "Too many incorrect attempts. Request a new code."
            : "Incorrect code.",
    };
  }

  const proof = await issueToken("loginproof", user.id);

  if (remember) {
    const raw = await issueTrustedDevice(user.id);
    (await cookies()).set(TRUST_COOKIE, raw, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
    });
  }

  return { ok: true, proof };
}

// Generic by contract: same response regardless of whether the account exists
// or is already verified (no account enumeration).
export async function resendVerification(email: string): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;

  const user = await db.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, emailVerified: true, email: true },
  });
  if (!user?.email || user.emailVerified) return;

  try {
    await sendVerificationEmail(user.id);
  } catch {
    // Swallowed on purpose: rate-limit / transient send failures must not
    // change the response (enumeration + UX). User can retry shortly.
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return;
  try {
    await requestPasswordResetService(parsed.data);
  } catch {
    // Generic by contract; see resendVerification.
  }
}

export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
): Promise<{ error?: string }> {
  if (!token) return { error: "This reset link is invalid or has expired." };
  const result = await resetPasswordService(token, newPassword);
  return result.ok ? {} : { error: result.error };
}
