import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

import { authenticateWithCredentials } from "@/modules/auth/authenticate";
import { checkRateLimit, getClientIp } from "./rate-limit";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

/**
 * Config do Auth.js v5. Único provider: Credentials (email/senha) — sem
 * OAuth, sem cadastro público (`10-AUTH.md`).
 *
 * Cookies: Auth.js já aplica `httpOnly` + `secure` (condicionado a HTTPS) +
 * `sameSite=lax` por padrão para o cookie de sessão — sem necessidade de
 * override manual aqui.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS_IN_SECONDS,
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials, request) {
        const email =
          typeof credentials.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const rateLimitKey = `${getClientIp(request)}:${email}`;

        // Estoura o limite -> mesma resposta genérica de credenciais inválidas,
        // nunca revela que foi rate limit (`10-AUTH.md`).
        if (!checkRateLimit(rateLimitKey).allowed) {
          return null;
        }

        const result = await authenticateWithCredentials(credentials);
        return result.ok ? result.user : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
};
