import { prisma } from "@/lib/db/client";

/**
 * Busca usuário por email para fins de autenticação.
 *
 * Único ponto de acesso ao Prisma dentro do módulo de auth — a config do
 * Auth.js e o restante do domínio nunca tocam o Prisma client diretamente.
 */
export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

/** Só `createdAt` — usado pelo card de Perfil em `/settings` ("Membro desde", docs/12-SETTINGS.md). A sessão do NextAuth não expõe esse campo (`10-AUTH.md`). */
export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { createdAt: true } });
}
