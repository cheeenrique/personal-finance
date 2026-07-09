/**
 * Erros de domínio do módulo investments (docs/28-INVESTMENTS.md).
 *
 * Códigos tipados carregando contexto — mapeamento pra UI em actions.ts.
 */
export class InvestmentDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InvestmentDomainError";
  }
}

export class InvestmentNotFoundError extends InvestmentDomainError {
  constructor(investmentId: string, cause?: unknown) {
    super(`Investimento não encontrado: ${investmentId}`, "INVESTMENT_NOT_FOUND", cause, {
      investmentId,
    });
  }
}

/** Aporte maior que o saldo disponível da conta (bloqueio duro — docs/28-INVESTMENTS.md). */
export class InsufficientAccountBalanceError extends InvestmentDomainError {
  constructor(context: Record<string, unknown>) {
    super(
      "Saldo insuficiente na conta para este aporte",
      "INSUFFICIENT_ACCOUNT_BALANCE",
      undefined,
      context,
    );
  }
}

export class InvestmentAccountNotFoundError extends InvestmentDomainError {
  constructor(accountId: string) {
    super("Conta não encontrada", "INVESTMENT_ACCOUNT_NOT_FOUND", undefined, { accountId });
  }
}

export class InvestmentCategoryNotFoundError extends InvestmentDomainError {
  constructor(categoryId: string) {
    super("Categoria não encontrada", "INVESTMENT_CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

/** Asset existe mas não é INVESTMENT — não aceita aporte/yield. */
export class NotAnInvestmentError extends InvestmentDomainError {
  constructor(assetId: string) {
    super("Este ativo não é um investimento", "NOT_AN_INVESTMENT", undefined, { assetId });
  }
}
