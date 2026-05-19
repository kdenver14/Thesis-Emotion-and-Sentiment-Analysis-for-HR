import "server-only";
import { createHash, randomBytes } from "crypto";
import { db } from "~/server/db";

// "Remember me" device records. Same secrecy contract as VerificationToken:
// the raw secret lives only in the client cookie; only its SHA-256 hash is
// persisted, bound to userId + expiry. The cookie alone is never authoritative
// (validate() requires the row AND a userId match against the password-
// authenticated user in the same request).

export const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Mints a new trusted-device secret for the user. Multiple rows per user are
// allowed (one per browser that opted into "remember me"). Returns the raw
// secret to be set as the cookie value, never logged or persisted in clear.
export async function issueTrustedDevice(userId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await db.trustedDevice.create({
    data: {
      userId,
      tokenHash: hashSecret(raw),
      expires: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS),
    },
  });
  return raw;
}

// True only if the cookie secret maps to a live row owned by this exact user.
// Expired rows are treated as invalid and pruned. lastUsedAt is bumped for
// observability (best-effort, no transaction).
export async function validateTrustedDevice(
  raw: string,
  userId: string,
): Promise<boolean> {
  const row = await db.trustedDevice.findUnique({
    where: { tokenHash: hashSecret(raw) },
  });
  if (!row || row.userId !== userId) return false;

  if (row.expires.getTime() < Date.now()) {
    await db.trustedDevice.delete({ where: { id: row.id } });
    return false;
  }

  await db.trustedDevice.update({
    where: { id: row.id },
    data: { lastUsedAt: new Date() },
  });
  return true;
}

// Drops every trusted device for the user. Called on password change / reset
// so a credential rotation also evicts any device an attacker had remembered.
export async function revokeAllForUser(userId: string): Promise<void> {
  await db.trustedDevice.deleteMany({ where: { userId } });
}
