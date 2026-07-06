/**
 * Erros de domínio do módulo recurring.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class RecurringDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecurringDomainError";
  }
}

export class RecurringTransactionNotFoundError extends RecurringDomainError {
  constructor(recurringTransactionId: string, cause?: unknown) {
    super(`Recorrência não encontrada: ${recurringTransactionId}`, "RECURRING_NOT_FOUND", cause, {
      recurringTransactionId,
    });
  }
}

export class CategoryNotFoundError extends RecurringDomainError {
  constructor(categoryId: string) {
    super(`Categoria não encontrada: ${categoryId}`, "CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

/** Categoria existe e pertence ao usuário, mas o `type` dela não bate com o `type` da recorrência. */
export class CategoryTypeMismatchError extends RecurringDomainError {
  constructor(categoryId: string) {
    super("Categoria não é compatível com o tipo da recorrência", "CATEGORY_TYPE_MISMATCH", undefined, {
      categoryId,
    });
  }
}

export class AccountNotFoundError extends RecurringDomainError {
  constructor(accountId: string) {
    super(`Conta não encontrada: ${accountId}`, "ACCOUNT_NOT_FOUND", undefined, { accountId });
  }
}

/**
 * MONTHLY exige `dayOfMonth` (1-31); WEEKLY exige `dayOfWeek` (0-6) — ver
 * docs/20-TRANSACTIONS.md, "Recorrência". Reavaliado contra o estado
 * MESCLADO em updates parciais (ver service.ts `assertScheduleInvariant`).
 */
export class InvalidScheduleError extends RecurringDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "INVALID_SCHEDULE", undefined, context);
  }
}
