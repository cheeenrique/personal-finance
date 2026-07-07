import bcrypt from "bcryptjs";

import { Prisma } from "@/generated/prisma/client";
import {
  findUserCredentials,
  updateUserPassword,
  updateUserProfile,
} from "./repository";
import { EmailTakenError, InvalidCurrentPasswordError, UserNotFoundError } from "./errors";
import type { UpdatedProfile } from "./types";

/** Códigos de erro do Postgres via Prisma — ver https://www.prisma.io/docs/orm/reference/error-reference. */
const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_CONSTRAINT_VIOLATION;
}

const BCRYPT_SALT_ROUNDS = 10;

/**
 * Atualiza nome/email do usuário logado (card de Perfil em `/settings`,
 * docs/10-AUTH.md "Perfil do Usuário"). Colisão de email (unique constraint)
 * vira `EmailTakenError` em vez do 500 genérico do Prisma.
 *
 * NOTA de sessão: a sessão NextAuth (JWT) guarda name/email do momento do
 * login (`lib/auth/config.ts` callback `jwt`/`session`) — trocar aqui não
 * atualiza `session.user` até o próximo login. O `id` da sessão não muda,
 * então a sessão continua válida e as próximas queries usam o novo
 * nome/email do banco normalmente; só o texto exibido via `session.user.*`
 * fica desatualizado até relogar. Aceitável (YAGNI forçar re-login).
 */
async function updateProfile(userId: string, input: { name: string; email: string }): Promise<UpdatedProfile> {
  try {
    const updated = await updateUserProfile(userId, input);
    return { name: updated.name, email: updated.email };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw new EmailTakenError(input.email, error);
    }
    throw error;
  }
}

/**
 * Troca a senha do usuário logado após confirmar a senha atual
 * (docs/10-AUTH.md "Perfil do Usuário" + "Segurança"). `newPassword` já
 * validado (min 8 chars, diferente da atual) pelo `changePasswordSchema`
 * antes de chegar aqui.
 */
async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  const user = await findUserCredentials(userId);
  if (!user) throw new UserNotFoundError(userId);

  const currentPasswordMatches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentPasswordMatches) throw new InvalidCurrentPasswordError();

  const newPasswordHash = await bcrypt.hash(input.newPassword, BCRYPT_SALT_ROUNDS);
  await updateUserPassword(userId, newPasswordHash);
}

export const authService = {
  updateProfile,
  changePassword,
};
