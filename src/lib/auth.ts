import { compare } from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  isLocked,
  loginAttemptKey,
  recordFailure,
  recordSuccess,
} from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

function clientIpFromRequest(request: Request | undefined): string {
  const fwd = request?.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request?.headers.get("x-real-ip") ?? "unknown";
}

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const attemptKey = loginAttemptKey(
          clientIpFromRequest(request),
          email,
        );
        if (isLocked(attemptKey)) {
          throw new LoginRateLimited();
        }
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (!user || !user.isActive) {
          recordFailure(attemptKey);
          return null;
        }
        const valid = await compare(password, user.passwordHash);
        if (!valid) {
          recordFailure(attemptKey);
          return null;
        }
        recordSuccess(attemptKey);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
