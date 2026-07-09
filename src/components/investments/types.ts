/**
 * Tipos view de Investimentos — Decimal/Date → string na borda RSC→client
 * (mesmo padrão de `components/financings/types.ts`).
 */

export type InvestmentCardView = {
  id: string;
  name: string;
  currentValue: string;
  yieldPercentOfBenchmark: string | null;
  /** Taxa efetiva a.a. se CDI do dia disponível: cdi * percent/100. */
  effectiveAnnualRatePercent: string | null;
};

export type InvestmentContributionView = {
  id: string;
  description: string;
  amount: string;
  date: string;
  accountName: string | null;
  yieldPercentOfBenchmark: string | null;
};

export type InvestmentDetailView = {
  id: string;
  name: string;
  currentValue: string;
  purchaseValue: string;
  purchaseDate: string;
  yieldPercentOfBenchmark: string | null;
  notes: string | null;
  contributions: InvestmentContributionView[];
  cdiAnnualRatePercent: string | null;
  cdiSource: "GEMINI" | "MANUAL" | null;
  effectiveAnnualRatePercent: string | null;
};

export type AccountOptionView = {
  id: string;
  name: string;
  balance: string;
};
