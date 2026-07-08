import type { Loan, Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";

export type { Loan };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/**
 * Transação crua vinda do banco pra um `loanId` — pode ser `type=EXPENSE`
 * (parcela) OU `type=INCOME` (desembolso, no máximo 1 por empréstimo). O
 * `type` só existe pra permitir a separação em `service.ts`
 * (`deriveLoanProgress`/`findDisbursement`) — nunca some as duas juntas.
 */
export type LoanTransactionRow = { id: string; amount: Money; date: Date; isPaid: boolean; type: TransactionType };

/** Parcela já filtrada (`type=EXPENSE`) — pós-derivação (ver service.ts `deriveLoanProgress`). */
export type LoanInstallmentRow = { id: string; amount: Money; date: Date; isPaid: boolean };

/** Empréstimo + TODAS as transações cruas linkadas (parcelas + desembolso, ainda não separadas) — insumo de `listLoans`/`getLoan` (ver repository.ts). */
export type LoanWithTransactions = Loan & { transactions: LoanTransactionRow[] };

/** Próxima parcela ainda não paga, por data — `null` quando o empréstimo já está quitado. */
export type NextLoanInstallment = { date: Date; amount: Money } | null;

/**
 * Empréstimo + progresso derivado (docs/03-DATABASE.md, model Loan) — nada
 * persistido além de `Loan`/`Transaction` (mesmo princípio de
 * `InstallmentPurchase`, docs/23-INSTALLMENTS.md "Valores Derivados").
 *
 * `interest` = `totalToPay - principal` (derivado, sem coluna própria).
 * Diferente de `InstallmentPurchase` (parcela "paga" = `date <= hoje`, já que
 * compra no cartão nasce confirmada), aqui `paidAmount`/`paidCount` usam o
 * `isPaid` REAL da Transaction — a parcela do empréstimo nasce PREVISTA
 * (`isPaid=false`) e só vira paga quando o usuário confirma o pagamento (mesmo
 * fluxo de qualquer EXPENSE de conta, docs/20-TRANSACTIONS.md).
 */
export type LoanWithProgress = Loan & {
  interest: Money;
  paidAmount: Money;
  remainingAmount: Money;
  paidCount: number;
  nextInstallment: NextLoanInstallment;
};

/**
 * Desembolso (o crédito recebido ao contrair o empréstimo, `Transaction`
 * `type=INCOME` com esse `loanId`) — no máximo 1 por empréstimo (docs/
 * 03-DATABASE.md). `null` quando ainda não foi linkado manualmente (ver
 * service.ts `findDisbursement`). NUNCA entra em `paidAmount`/`paidCount`/
 * `remainingAmount` — só as parcelas (`type=EXPENSE`) contam pra progresso.
 */
export type LoanDisbursement = { amount: Money; date: Date } | null;

/**
 * `LoanWithProgress` + as parcelas cruas (só `type=EXPENSE`), ordenadas por
 * `date asc` (mesma ordem de `LoanWithTransactions`) + o desembolso separado
 * — insumo exclusivo da tela de detalhe (`/loans/[id]`, ver service.ts
 * `getLoanDetail`). `listLoans`/`getLoan` continuam sem esses campos: o
 * card/listagem de `/loans` só precisa dos agregados, não da lista completa
 * de parcelas nem do desembolso.
 */
export type LoanWithInstallments = LoanWithProgress & {
  installments: LoanInstallmentRow[];
  disbursement: LoanDisbursement;
};

/** Uma parcela recém-criada (ver `installments.ts` `createLoan`). */
export type LoanTransaction = { id: string; description: string; amount: Money; date: Date; isPaid: boolean };

/** Resultado da criação de um empréstimo — o Loan + as N parcelas geradas. */
export type CreateLoanResult = { loan: Loan; transactions: LoanTransaction[] };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/**
 * `Money` (Prisma.Decimal) não sobrevive à serialização de Server Actions do
 * Next.js sem conversão explícita pra string — mesma regra de
 * `modules/transactions/types.ts` `ClientTransaction`. Formas abaixo cruzam a
 * fronteira Server Action → Client Component.
 */
export type ClientLoanTransaction = Omit<LoanTransaction, "amount"> & { amount: string };

export type ClientNextLoanInstallment = { date: Date; amount: string } | null;

export type ClientLoanWithProgress = Omit<
  LoanWithProgress,
  | "principal"
  | "totalToPay"
  | "installmentAmount"
  | "interest"
  | "paidAmount"
  | "remainingAmount"
  | "nextInstallment"
  | "interestRate"
> & {
  principal: string;
  totalToPay: string;
  installmentAmount: string;
  interest: string;
  paidAmount: string;
  remainingAmount: string;
  nextInstallment: ClientNextLoanInstallment;
  /** `null` = sem juros configurado (default do produto, docs/03-DATABASE.md) — nunca omitido, sempre presente pra o front saber se mostra o bloco de juros. */
  interestRate: string | null;
};

/**
 * Campos de financiamento (`Loan.kind=FINANCING`, docs/03-DATABASE.md) que
 * também são `Prisma.Decimal | null` — `createFinancingAction` reusa o mesmo
 * `ClientCreateLoanResult` de `createLoanAction`, então precisam do mesmo
 * tratamento de `interestRate` (Decimal→string, `null` = não preenchido em
 * LOAN comum ou não informado no financiamento).
 */
type ClientFinancingDecimalFields = "downPayment" | "assetValue" | "cet" | "financedTaxes" | "financedInsurance" | "financedFees";

export type ClientCreateLoanResult = {
  loan: Omit<
    Loan,
    "principal" | "totalToPay" | "installmentAmount" | "interestRate" | ClientFinancingDecimalFields
  > & {
    principal: string;
    totalToPay: string;
    installmentAmount: string;
    interestRate: string | null;
    downPayment: string | null;
    assetValue: string | null;
    cet: string | null;
    financedTaxes: string | null;
    financedInsurance: string | null;
    financedFees: string | null;
  };
  transactions: ClientLoanTransaction[];
};

/** `interest.ts` `EarlyPaymentSuggestion` cruzando a fronteira Server Action → Client Component (Decimal → string, mesma regra do resto do módulo). */
export type ClientEarlyPaymentSuggestion = { suggested: string; fullAmount: string; discount: string };

/**
 * `simulate.ts` `LoanAmortizationBalance` cruzando a fronteira Server Action
 * → Client Component — mesma regra de Decimal→string do resto do módulo,
 * `endDate` continua `Date | null` (datas atravessam Server Action sem
 * conversão, ver `ClientNextLoanInstallment`).
 */
export type ClientLoanAmortizationBalance = {
  nominal: string;
  presentValue: string;
  installmentsCount: number;
  endDate: Date | null;
};

/** `simulate.ts` `LoanAmortizationSimulation` cruzando a fronteira Server Action → Client Component. */
export type ClientLoanAmortizationSimulation = {
  nextDueDate: Date;
  installments: { count: number; ids: string[]; numbers: number[]; dates: Date[] };
  interestDiscount: string;
  totalToPayToday: string;
  period: { start: Date; end: Date };
  before: ClientLoanAmortizationBalance;
  after: ClientLoanAmortizationBalance;
};
