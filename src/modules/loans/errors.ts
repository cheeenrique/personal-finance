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

/** Uma parcela específica do empréstimo não existe, não pertence ao usuário/empréstimo, ou não é `type=EXPENSE` (docs/10-AUTH.md). */
export class LoanInstallmentNotFoundError extends LoanDomainError {
  constructor(installmentId: string) {
    super("Parcela não encontrada", "LOAN_INSTALLMENT_NOT_FOUND", undefined, { installmentId });
  }
}

/**
 * `interestRate`/`interestPeriod` só fazem sentido juntos — juros é
 * OPCIONAL (docs/03-DATABASE.md, model Loan), mas "taxa sem período" ou
 * "período sem taxa" é dado de contrato incompleto, nunca um estado válido.
 */
export class LoanInterestInvariantError extends LoanDomainError {
  constructor(context: Record<string, unknown>) {
    super(
      "Informe taxa de juros e período juntos, ou nenhum dos dois",
      "LOAN_INTEREST_INVARIANT",
      undefined,
      context,
    );
  }
}

/** `totalToPay` não pode ficar menor que `principal` após a edição (mesma invariante de `createLoanSchema`, reavaliada aqui contra o estado MESCLADO — ver service.ts `updateLoan`). */
export class LoanTotalBelowPrincipalError extends LoanDomainError {
  constructor(context: Record<string, unknown>) {
    super("Total a pagar não pode ser menor que o principal", "LOAN_TOTAL_BELOW_PRINCIPAL", undefined, context);
  }
}

/** `installmentsCount` editado pra um valor menor que o número de parcelas JÁ PAGAS — reduziria um histórico que já aconteceu, nunca uma edição válida. */
export class LoanInstallmentsBelowPaidCountError extends LoanDomainError {
  constructor(context: Record<string, unknown>) {
    super(
      "Número de parcelas não pode ser menor que o número de parcelas já pagas",
      "LOAN_INSTALLMENTS_BELOW_PAID_COUNT",
      undefined,
      context,
    );
  }
}

/** `settleLoan` chamado num empréstimo que já não tem nenhuma parcela pendente — não há o que quitar. */
export class LoanAlreadySettledError extends LoanDomainError {
  constructor(loanId: string) {
    super("Empréstimo já está totalmente pago", "LOAN_ALREADY_SETTLED", undefined, { loanId });
  }
}

/**
 * `markInstallmentPaid` perdeu a corrida: a parcela já não está mais
 * `isPaid=false` no instante do `UPDATE` (foi paga individualmente — ex.:
 * `updateTransactionAction` — entre a leitura de "não pagas" no início de
 * `settleLoan` e a escrita desta parcela específica dentro da mesma
 * `$transaction`). Sem essa recheck, a quitação em lote sobrescreveria o
 * `amount` real já pago com o valor rateado (docs backlog L4).
 */
export class LoanInstallmentAlreadyPaidError extends LoanDomainError {
  constructor(installmentId: string) {
    super("Parcela já foi paga", "LOAN_INSTALLMENT_ALREADY_PAID", undefined, { installmentId });
  }
}
