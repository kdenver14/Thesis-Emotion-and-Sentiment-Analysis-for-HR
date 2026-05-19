import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import {
  CredentialsSignin,
  type DefaultSession,
  type NextAuthConfig,
} from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cookies } from "next/headers";
import { loginSchema } from "~/schemas/auth";
import bcrypt from "bcryptjs";
import { asRole, type Role } from "~/types/roles";

import { db } from "~/server/db";
import { consumeToken } from "~/server/repositories/verificationToken";
import { validateTrustedDevice } from "~/server/repositories/trustedDevice";

// Distinct from any NextAuth-managed cookie (authjs.*) so signOut() never
// clears it: surviving logout is exactly what makes "remember me" skip the
// code on the next login.
export const TRUST_COOKIE = "bh.td";

// Best-effort read; outside a request scope cookies() throws, which we treat
// as "no trusted device" (fall through to the 2FA challenge).
async function readTrustCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(TRUST_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role?: string;
  }
}

// Thrown when credentials are valid but the email is unverified. The `code`
// surfaces as `?error=CredentialsSignin&code=unverified`, letting the client
// distinguish this from a bad password. This is the hard server-side gate;
// the /login pre-check is only a friendlier UX path to the same outcome.
class EmailNotVerifiedError extends CredentialsSignin {
  code = "unverified";
}

// Credentials were correct but the second factor is missing. The normal
// client never hits this (it always sends a proof or a valid trust cookie);
// it is the hard server-side gate against a direct signIn() that skips the
// 2FA server action. Surfaces as ?error=CredentialsSignin&code=2fa_required.
class TwoFactorRequiredError extends CredentialsSignin {
  code = "2fa_required";
}

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          const { email, password, proof } = loginSchema.parse(credentials);

          const user = await db.user.findUnique({
            where: { email },
          });

          if (!user?.password) {
            return null;
          }

          const isValid = await bcrypt.compare(password, user.password);

          if (!isValid) {
            return null;
          }

          // Gate lives in the Credentials path only. Discord OAuth bypasses
          // authorize() entirely (PrismaAdapter stamps emailVerified from the
          // verified provider email). If this gate ever moves to middleware or
          // a session callback, add an explicit OAuth carve-out or Discord
          // users get locked out.
          if (!user.emailVerified) {
            throw new EmailNotVerifiedError();
          }

          const sessionUser = {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };

          // Second factor. The 2FA server action mints a single-use, 90s
          // loginproof after the emailed code checks out, then calls signIn
          // with it. consumeToken is atomic single-use, so a proof cannot be
          // replayed; the userId bind stops a proof minted for one account
          // unlocking another.
          if (proof) {
            const bound = await consumeToken(proof);
            if (bound?.purpose === "loginproof" && bound.userId === user.id) {
              return sessionUser;
            }
            throw new TwoFactorRequiredError();
          }

          // No proof: a remembered device may skip the code. The cookie
          // secret is hashed and matched to a live row owned by THIS
          // password-authenticated user, so the cookie alone is not enough.
          const trust = await readTrustCookie();
          if (trust && (await validateTrustedDevice(trust, user.id))) {
            return sessionUser;
          }

          throw new TwoFactorRequiredError();
        } catch (error) {
          // Let the unverified-email signal through; everything else
          // collapses to a generic invalid-credentials response.
          if (error instanceof CredentialsSignin) throw error;
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  adapter: PrismaAdapter(db),
  callbacks: {
    jwt: ({ token, user, trigger, session }) => {
      if (user) {
        (token as { role?: Role }).role = asRole(user.role);
      }
      if (trigger === "update" && typeof (session as { name?: unknown })?.name === "string") {
        token.name = (session as { name: string }).name;
      }
      return token;
    },
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub,
        role: asRole((token as { role?: unknown }).role),
      },
    }),
  },
} satisfies NextAuthConfig;
