/**
 * Erros de domínio do módulo goals.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class GoalDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GoalDomainError";
  }
}

export class GoalNotFoundError extends GoalDomainError {
  constructor(goalId: string, cause?: unknown) {
    super(`Meta não encontrada: ${goalId}`, "GOAL_NOT_FOUND", cause, { goalId });
  }
}

/**
 * `sourceType` inconsistente com `sourceAccountId`/`sourceAssetId` (ACCOUNT
 * sem conta, ASSET sem ativo, ou MANUAL com um dos dois preenchido) — MESMA
 * checagem já feita no zod (`schemas.ts` `createGoalSchema` superRefine),
 * reforçada aqui pro caso do service ser chamado direto (sem passar pela
 * Server Action).
 */
export class GoalInvalidSourceError extends GoalDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "GOAL_INVALID_SOURCE", undefined, context);
  }
}

/** `sourceAccountId` não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança"). */
export class GoalSourceAccountNotFoundError extends GoalDomainError {
  constructor(accountId: string) {
    super(`Conta de origem não encontrada: ${accountId}`, "GOAL_SOURCE_ACCOUNT_NOT_FOUND", undefined, { accountId });
  }
}

/** `sourceAssetId` não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança"). */
export class GoalSourceAssetNotFoundError extends GoalDomainError {
  constructor(assetId: string) {
    super(`Ativo de origem não encontrado: ${assetId}`, "GOAL_SOURCE_ASSET_NOT_FOUND", undefined, { assetId });
  }
}
