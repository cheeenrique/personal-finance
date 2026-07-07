import type { InterestPeriod } from "@/generated/prisma/enums";

/**
 * Tipos "view" do módulo Empréstimos — versões serializáveis (Decimal →
 * string, Date → ISO string) de `modules/loans/types.ts`. Necessário porque
 * `Prisma.Decimal`/`Date` de classe não atravessam a fronteira Server →
 * Client Component sem essa conversão (mesmo padrão de
 * `components/installments/types.ts`/`components/accounts/types.ts`).
 */

export type LoanNextInstallmentView = { date: string; amount: string } | null;

/** Forma usada pelo card da listagem `/loans` — só os agregados, sem a lista completa de parcelas (ver `modules/loans/service.ts` `listLoans`). */
export type LoanCardView = {
  id: string;
  description: string;
  lender: string | null;
  totalToPay: string;
  installmentsCount: number;
  paidCount: number;
  paidAmount: string;
  remainingAmount: string;
  nextInstallment: LoanNextInstallmentView;
};

export type LoanInstallmentView = {
  id: string;
  amount: string;
  date: string;
  isPaid: boolean;
};

/** Desembolso serializado (ver `modules/loans/types.ts` `LoanDisbursement`) — `null` quando ainda não linkado. */
export type LoanDisbursementView = { amount: string; date: string } | null;

/** `LoanCardView` + principal/juros/parcelas em detalhe — insumo de `/loans/[id]` (ver `modules/loans/service.ts` `getLoanDetail`). */
export type LoanDetailData = LoanCardView & {
  principal: string;
  interest: string;
  installmentAmount: string;
  installments: LoanInstallmentView[];
  disbursement: LoanDisbursementView;
  /**
   * Campos do contrato que só a EDIÇÃO precisa (`LoanFormModal` pré-preenche
   * a partir daqui quando `loan` é passado) — a listagem/card não usa nada
   * disso, só o form de edição aberto a partir do detalhe.
   */
  firstDueDate: string;
  accountId: string;
  categoryId: string | null;
  /** `null` = sem juros configurado (default do produto) — mesmo contrato de `ClientLoanWithProgress.interestRate`. */
  interestRate: string | null;
  interestPeriod: InterestPeriod | null;
};
