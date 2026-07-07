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

/** `LoanCardView` + principal/juros/parcelas em detalhe — insumo de `/loans/[id]` (ver `modules/loans/service.ts` `getLoanDetail`). */
export type LoanDetailData = LoanCardView & {
  principal: string;
  interest: string;
  installmentAmount: string;
  installments: LoanInstallmentView[];
};
