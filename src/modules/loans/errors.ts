/**
 * Erros de domínio do módulo loans.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class LoanDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "LoanDomainError";
  }
}

export class LoanNotFoundError extends LoanDomainError {
  constructor(loanId: string, cause?: unknown) {
    super(`Empréstimo não encontrado: ${loanId}`, "LOAN_NOT_FOUND", cause, { loanId });
  }
}

/** Conta referenciada não existe ou não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança"). */
export class LoanAccountNotFoundError extends LoanDomainError {
  constructor(accountId: string) {
    super("Conta não encontrada", "LOAN_ACCOUNT_NOT_FOUND", undefined, { accountId });
  }
}

/** Categoria referenciada não existe ou não pertence ao usuário. `categoryId` é opcional no Loan — só validada quando informada. */
export class LoanCategoryNotFoundError extends LoanDomainError {
  constructor(categoryId: string) {
    super("Categoria não encontrada", "LOAN_CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

/**
 * A última parcela (resíduo = `totalToPay - installmentAmount * (N-1)`)
 * ficaria zero ou negativa — dados de contrato inconsistentes
 * (`installmentAmount` alto demais para o `totalToPay`/`installmentsCount`
 * informados). Ver `installments.ts` `splitLoanInstallmentAmounts`.
 */
export class LoanInstallmentMismatchError extends LoanDomainError {
  constructor(context: Record<string, unknown>) {
    super(
      "Valor da parcela não é compatível com o total a pagar informado",
      "LOAN_INSTALLMENT_MISMATCH",
      undefined,
      context,
    );
  }
}
