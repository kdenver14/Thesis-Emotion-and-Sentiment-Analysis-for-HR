import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { db } from "~/server/db";

// All VerificationToken DB access. Raw secrets are never persisted: only their
// SHA-256 hash is stored, so a database leak does not equal account takeover.
// The raw secret lives only in the email (link token) or as a short numeric
// code (step-up). Link tokens are looked up by global-unique hash; codes are
// looked up by identifier and salted with userId so the tiny 6-digit space
// cannot collide across users on the unique index.

export type TokenPurpose =
  | "verify"
  | "reset"
  | "pwchange"
  | "login"
  | "loginproof";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  verify: 15 * 60_000,
  reset: 15 * 60_000,
  pwchange: 10 * 60_000,
  // Emailed 6-digit login code (verifyCode path).
  login: 10 * 60_000,
  // Single-use handoff from "code verified" (server action) to signIn's
  // authorize(). Sub-second in the happy path; the short TTL is the second
  // wall behind single-use against a leaked/replayed proof.
  loginproof: 90_000,
};

const RESEND_COOLDOWN_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;

export type CodeResult = "ok" | "invalid" | "expired" | "locked";

export class TokenRateLimitError extends Error {
  constructor() {
    super("Please wait a minute before requesting another email.");
    this.name = "TokenRateLimitError";
  }
}

function hashSecret(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function identifierFor(purpose: TokenPurpose, userId: string): string {
  return `${purpose}:${userId}`;
}

function parseIdentifier(
  identifier: string,
): { purpose: TokenPurpose; userId: string } | null {
  const sep = identifier.indexOf(":");
  if (sep === -1) return null;
  const purpose = identifier.slice(0, sep);
  const userId = identifier.slice(sep + 1);
  // Codes (login, pwchange) never reach consumeToken; loginproof does.
  if (
    (purpose !== "verify" && purpose !== "reset" && purpose !== "loginproof") ||
    !userId
  )
    return null;
  return { purpose, userId };
}

// Throws TokenRateLimitError if a token for this identifier was issued less
// than the cooldown ago. Issue-time is derived as expires - ttlMs (no extra
// column). Shared by link tokens and step-up codes.
async function enforceCooldown(
  identifier: string,
  ttlMs: number,
): Promise<void> {
  const newest = await db.verificationToken.findFirst({
    where: { identifier },
    orderBy: { expires: "desc" },
    select: { expires: true },
  });
  if (newest) {
    const issuedAtMs = newest.expires.getTime() - ttlMs;
    if (Date.now() - issuedAtMs < RESEND_COOLDOWN_MS) {
      throw new TokenRateLimitError();
    }
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// Issues a fresh single-use secret for (purpose, userId). Invalidates any
// prior tokens for the same identifier so there is never a usable pile-up.
// Throws TokenRateLimitError if the last issue was under the cooldown.
export async function issueToken(
  purpose: TokenPurpose,
  userId: string,
): Promise<string> {
  const identifier = identifierFor(purpose, userId);
  const ttlMs = TOKEN_TTL_MS[purpose];

  await enforceCooldown(identifier, ttlMs);

  const raw = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: {
        identifier,
        token: hashSecret(raw),
        expires: new Date(Date.now() + ttlMs),
      },
    }),
  ]);
  return raw;
}

// Single-use: validates the secret, enforces expiry, and deletes the row in
// one transaction so a token cannot be replayed. Returns the bound identity
// or null for any failure (unknown / expired).
export async function consumeToken(
  raw: string,
): Promise<{ purpose: TokenPurpose; userId: string } | null> {
  const token = hashSecret(raw);
  return db.$transaction(async (tx) => {
    const row = await tx.verificationToken.findUnique({ where: { token } });
    if (!row) return null;
    await tx.verificationToken.deleteMany({ where: { token } });
    if (row.expires.getTime() < Date.now()) return null;
    return parseIdentifier(row.identifier);
  });
}

// Read-only twin of consumeToken: whether a link would still work, without
// using it up. Pages check on open; the form consumes on submit.
export async function peekToken(
  raw: string,
): Promise<{ purpose: TokenPurpose; userId: string } | null> {
  const row = await db.verificationToken.findUnique({
    where: { token: hashSecret(raw) },
  });
  if (!row || row.expires.getTime() < Date.now()) return null;
  return parseIdentifier(row.identifier);
}

export async function invalidateTokens(
  purpose: TokenPurpose,
  userId: string,
): Promise<void> {
  await db.verificationToken.deleteMany({
    where: { identifier: identifierFor(purpose, userId) },
  });
}

// Issues a 6-digit step-up code for (purpose, userId). Stored as
// hash(`${userId}:${code}`) so identical codes for different users do not
// collide the unique index. Returns the raw code (to be emailed, never logged).
export async function issueCode(
  purpose: TokenPurpose,
  userId: string,
): Promise<string> {
  const identifier = identifierFor(purpose, userId);
  const ttlMs = TOKEN_TTL_MS[purpose];

  await enforceCooldown(identifier, ttlMs);

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.$transaction([
    db.verificationToken.deleteMany({ where: { identifier } }),
    db.verificationToken.create({
      data: {
        identifier,
        token: hashSecret(`${userId}:${code}`),
        expires: new Date(Date.now() + ttlMs),
      },
    }),
  ]);
  return code;
}

// Verifies a step-up code. Constant-time hash compare; expiry enforced;
// failed attempts counted. The code is destroyed on success ("ok"). An
// expired or locked code is kept until the next one is issued (issueCode
// deletes prior), so every further try gets the same answer instead of a
// misleading "invalid". Single active code per identifier.
export async function verifyCode(
  purpose: TokenPurpose,
  userId: string,
  code: string,
): Promise<CodeResult> {
  const identifier = identifierFor(purpose, userId);
  const row = await db.verificationToken.findFirst({ where: { identifier } });
  if (!row) return "invalid";

  if (row.expires.getTime() < Date.now()) return "expired";

  // Take one attempt before comparing, in a single conditional write: guesses
  // sent in parallel each cost an attempt, and none gets through once the cap
  // is reached. A locked code therefore never validates again.
  const claimed = await db.verificationToken.updateMany({
    where: { token: row.token, attempts: { lt: CODE_MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return "locked";

  if (timingSafeEqualHex(row.token, hashSecret(`${userId}:${code}`))) {
    await db.verificationToken.deleteMany({ where: { identifier } });
    return "ok";
  }
  return row.attempts + 1 >= CODE_MAX_ATTEMPTS ? "locked" : "invalid";
}
