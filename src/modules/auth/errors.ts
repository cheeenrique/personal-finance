/**
 * Erros de domínio do módulo auth (update de perfil/senha).
 *
 * Erros como dado (ver ~/.claude/rules/06-composition-errors.md) — nunca
 * throw genérico pra caso de negócio conhecido. Mapeamento pra HTTP/mensagem
 * de UI acontece no boundary (actions.ts), não aqui.
 */
export class AuthDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AuthDomainError";
  }
}

/** Reflete o unique de `User.email` (docs/03-DATABASE.md) — colisão detectada via `Prisma.PrismaClientKnownRequestError` (P2002) em `updateUserProfile`. */
export class EmailTakenError extends AuthDomainError {
  constructor(email: string, cause?: unknown) {
    super("Este email já está em uso.", "EMAIL_TAKEN", cause, { email });
  }
}

/** `bcrypt.compare(currentPassword, user.passwordHash)` não bateu — troca de senha nunca prossegue sem confirmar a senha atual. */
export class InvalidCurrentPasswordError extends AuthDomainError {
  constructor() {
    super("Senha atual incorreta.", "INVALID_CURRENT_PASSWORD");
  }
}

/** Defensivo — não deveria ocorrer com `userId` vindo de uma sessão válida (`auth()`), mas cobre o caso de usuário deletado com sessão ainda ativa. */
export class UserNotFoundError extends AuthDomainError {
  constructor(userId: string) {
    super("Usuário não encontrado.", "USER_NOT_FOUND", undefined, { userId });
  }
}
