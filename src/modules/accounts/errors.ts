/**
 * Erros de domínio do módulo accounts.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class AccountDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AccountDomainError";
  }
}

export class AccountNotFoundError extends AccountDomainError {
  constructor(accountId: string, cause?: unknown) {
    super(`Conta não encontrada: ${accountId}`, "ACCOUNT_NOT_FOUND", cause, { accountId });
  }
}

export class TransferSameAccountError extends AccountDomainError {
  constructor(accountId: string) {
    super("Conta de origem e destino não podem ser a mesma", "TRANSFER_SAME_ACCOUNT", undefined, {
      accountId,
    });
  }
}

export class TransferAccountNotFoundError extends AccountDomainError {
  constructor(accountId: string, role: "origin" | "destination") {
    const label = role === "origin" ? "origem" : "destino";
    super(`Conta de ${label} não encontrada`, "TRANSFER_ACCOUNT_NOT_FOUND", undefined, {
      accountId,
      role,
    });
  }
}
