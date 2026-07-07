import type { Loan, Prisma } from "@/generated/prisma/client";

export type { Loan };

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

/** Parcela crua (pré-derivação) — insumo do progresso derivado (ver service.ts `deriveLoanProgress`). */
export type LoanInstallmentRow = { id: string; amount: Money; date: Date; isPaid: boolean };

/** Empréstimo + as parcelas cruas — insumo de `listLoans`/`getLoan` (ver repository.ts). */
export type LoanWithTransactions = Loan & { transactions: LoanInstallmentRow[] };

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
 * `LoanWithProgress` + as parcelas cruas, ordenadas por `date asc` (mesma
 * ordem de `LoanWithTransactions`) — insumo exclusivo da tela de detalhe
 * (`/loans/[id]`, ver service.ts `getLoanDetail`). `listLoans`/`getLoan`
 * continuam sem esse array: o card/listagem de `/loans` só precisa dos
 * agregados, não da lista completa de parcelas.
 */
export type LoanWithInstallments = LoanWithProgress & { installments: LoanInstallmentRow[] };

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
  "principal" | "totalToPay" | "installmentAmount" | "interest" | "paidAmount" | "remainingAmount" | "nextInstallment"
> & {
  principal: string;
  totalToPay: string;
  installmentAmount: string;
  interest: string;
  paidAmount: string;
  remainingAmount: string;
  nextInstallment: ClientNextLoanInstallment;
};

export type ClientCreateLoanResult = {
  loan: Omit<Loan, "principal" | "totalToPay" | "installmentAmount"> & {
    principal: string;
    totalToPay: string;
    installmentAmount: string;
  };
  transactions: ClientLoanTransaction[];
};
