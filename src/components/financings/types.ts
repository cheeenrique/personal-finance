import type { InterestPeriod, AmortizationSystem } from "@/generated/prisma/enums";
import type { LoanNextInstallmentView, LoanInstallmentView, LoanDisbursementView } from "@/components/loans/types";

/**
 * Tipos "view" de Financiamento (`Loan.kind=FINANCING`, docs/03-DATABASE.md)
 * — mesma regra de serialização de `components/loans/types.ts`
 * (`Prisma.Decimal`/`Date` → `string` na borda Server → Client Component).
 * `LoanNextInstallmentView`/`LoanInstallmentView`/`LoanDisbursementView` são
 * reusados de lá (mesma forma, sem duplicar — rule 02-dry-kiss-yagni).
 */
export type { LoanNextInstallmentView, LoanInstallmentView, LoanDisbursementView };

/** Forma usada pelo card da listagem `/financings` — mesmos agregados de `LoanCardView` + o sistema de amortização (badge do card). */
export type FinancingCardView = {
  id: string;
  description: string;
  lender: string | null;
  totalToPay: string;
  installmentsCount: number;
  paidCount: number;
  paidAmount: string;
  remainingAmount: string;
  nextInstallment: LoanNextInstallmentView;
  amortizationSystem: AmortizationSystem;
};

/**
 * `FinancingCardView` + principal/juros/parcelas + os campos exclusivos do
 * contrato de financiamento (entrada, valor do bem, CET, custos embutidos) —
 * insumo de `/financings/[id]`. `assetName` é resolvido no Server Component
 * (`assetService.list`, ver `page.tsx`) — `Loan.assetId` sozinho não dá o
 * nome pra exibir o link "Ver bem" sem uma 2ª leitura.
 */
export type FinancingDetailData = FinancingCardView & {
  principal: string;
  interest: string;
  installmentAmount: string;
  installments: LoanInstallmentView[];
  disbursement: LoanDisbursementView;
  firstDueDate: string;
  accountId: string;
  categoryId: string | null;
  interestRate: string | null;
  interestPeriod: InterestPeriod | null;
  downPayment: string | null;
  assetValue: string | null;
  assetId: string | null;
  assetName: string | null;
  cet: string | null;
  operationRef: string | null;
  financedTaxes: string | null;
  financedInsurance: string | null;
  financedFees: string | null;
  /**
   * "Quitar hoje" (valor presente somado das parcelas não pagas, na data de
   * hoje) — `null` quando o financiamento já está quitado (nada a
   * antecipar). Computado no Server Component (`page.tsx`) reusando
   * `modules/loans/simulate.ts` `simulateAmortization` (função pura já
   * exportada pelo módulo, `type: "full"`) — não duplica a matemática de
   * valor presente aqui.
   */
  settleTodayAmount: string | null;
};
