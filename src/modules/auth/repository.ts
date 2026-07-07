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

/** `passwordHash` incluso — usado só por `authService.changePassword` pra comparar a senha atual antes de trocar. Nunca cruza a fronteira Server Action → Client. */
export function findUserCredentials(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, passwordHash: true },
  });
}

/** Atualiza nome/email. Colisão de email (unique constraint) é tratada no service.ts via `Prisma.PrismaClientKnownRequestError` (P2002), não aqui. */
export function updateUserProfile(userId: string, data: { name: string; email: string }) {
  return prisma.user.update({ where: { id: userId }, data: { name: data.name, email: data.email } });
}

/** `passwordHash` já vem pronto (bcrypt.hash aplicado no service.ts) — repository nunca faz hashing. */
export function updateUserPassword(userId: string, passwordHash: string) {
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } });
}
