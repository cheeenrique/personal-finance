/**
 * Erros de domínio do módulo merchant-rules.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class MerchantRuleDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MerchantRuleDomainError";
  }
}

export class MerchantRuleNotFoundError extends MerchantRuleDomainError {
  constructor(ruleId: string, cause?: unknown) {
    super(`Regra não encontrada: ${ruleId}`, "MERCHANT_RULE_NOT_FOUND", cause, { ruleId });
  }
}

/** Categoria da regra deve pertencer ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança"). */
export class MerchantRuleCategoryNotFoundError extends MerchantRuleDomainError {
  constructor(categoryId: string) {
    super(`Categoria não encontrada: ${categoryId}`, "MERCHANT_RULE_CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

/** Reflete o unique (userId, pattern) do schema — já existe uma regra pra esse padrão. */
export class MerchantRuleAlreadyExistsError extends MerchantRuleDomainError {
  constructor(pattern: string, cause?: unknown) {
    super(`Já existe uma regra para "${pattern}"`, "MERCHANT_RULE_ALREADY_EXISTS", cause, { pattern });
  }
}
