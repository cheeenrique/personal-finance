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
