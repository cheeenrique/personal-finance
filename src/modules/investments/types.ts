import { Prisma } from "@/generated/prisma/client";

export type Money = Prisma.Decimal;

export type InvestmentContributionRow = {
  id: string;
  description: string;
  amount: Money;
  date: Date;
  accountId: string | null;
  accountName: string | null;
  yieldPercentOfBenchmark: Money | null;
};

export type InvestmentListItem = {
  id: string;
  name: string;
  currentValue: Money;
  purchaseValue: Money;
  purchaseDate: Date;
  yieldPercentOfBenchmark: Money | null;
  notes: string | null;
};

export type InvestmentDetail = InvestmentListItem & {
  contributions: InvestmentContributionRow[];
};

export type CdiQuoteView = {
  annualRatePercent: Money;
  date: Date;
  source: "GEMINI" | "MANUAL";
};

export type YieldProjection = {
  principal: string;
  yieldAmount: string;
  projectedValue: string;
  effectiveAnnualRatePercent: string;
  days: number;
  cdiAnnualRatePercent: string;
  yieldPercentOfBenchmark: string;
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
