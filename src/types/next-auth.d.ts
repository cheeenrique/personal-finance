import type { DefaultSession } from "next-auth";

/**
 * Expõe `user.id` na sessão (`10-AUTH.md`: toda query no backend filtra por
 * `session.user.id`).
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
