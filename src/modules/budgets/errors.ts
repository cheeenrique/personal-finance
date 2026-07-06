/**
 * Erros de domínio do módulo budgets.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class BudgetDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BudgetDomainError";
  }
}

export class BudgetNotFoundError extends BudgetDomainError {
  constructor(budgetId: string, cause?: unknown) {
    super(`Orçamento não encontrado: ${budgetId}`, "BUDGET_NOT_FOUND", cause, { budgetId });
  }
}

/** Reflete o unique (userId, categoryId, month, year) do schema (docs/03-DATABASE.md, "Regra 1"). */
export class BudgetAlreadyExistsError extends BudgetDomainError {
  constructor(categoryId: string, month: number, year: number, cause?: unknown) {
    super(
      `Já existe um orçamento para essa categoria em ${month}/${year}`,
      "BUDGET_ALREADY_EXISTS",
      cause,
      { categoryId, month, year },
    );
  }
}

export class BudgetCategoryNotFoundError extends BudgetDomainError {
  constructor(categoryId: string) {
    super(`Categoria não encontrada: ${categoryId}`, "BUDGET_CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

/**
 * `spentAmount` só soma Transactions EXPENSE (docs/26-BUDGETS.md, "Cálculo") —
 * orçamento numa categoria INCOME nunca teria gasto associado, então é
 * bloqueado na criação/edição em vez de silenciosamente ficar sempre zerado.
 */
export class BudgetCategoryTypeMismatchError extends BudgetDomainError {
  constructor(categoryId: string) {
    super(
      "Orçamento só pode ser criado em categoria de despesa (EXPENSE)",
      "BUDGET_CATEGORY_TYPE_MISMATCH",
      undefined,
      { categoryId },
    );
  }
}
