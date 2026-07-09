import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Prisma } from "@/generated/prisma/client";

import { auth } from "@/lib/auth";
import { investmentService } from "@/modules/investments/service";
import { accountService } from "@/modules/accounts/service";
import { InvestmentNotFoundError } from "@/modules/investments/errors";
import { InvestmentDetailView } from "@/components/investments/investment-detail-view";
import type { AccountOptionView, InvestmentDetailView as DetailView } from "@/components/investments/types";

type InvestmentDetailPageProps = {
  params: Promise<{ id: string }>;
};

/**
 * `/investments/[id]` — detalhe, projeção, aportes (docs/28-INVESTMENTS.md).
 */
export default async function InvestmentDetailPage({ params }: InvestmentDetailPageProps) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  let detail;
  try {
    detail = await investmentService.getDetail(userId, id);
  } catch (error) {
    if (error instanceof InvestmentNotFoundError) notFound();
    throw error;
  }

  const [accountsWithBalance, cdi] = await Promise.all([
    accountService.listWithBalances(userId),
    investmentService.getCdi(),
  ]);

  const cdiRate = cdi?.annualRatePercent ?? null;
  const percent = detail.yieldPercentOfBenchmark;
  let effective: string | null = null;
  if (cdiRate && percent) {
    effective = new Prisma.Decimal(cdiRate).mul(percent).div(100).toFixed(4);
  }

  const investment: DetailView = {
    id: detail.id,
    name: detail.name,
    currentValue: detail.currentValue.toString(),
    purchaseValue: detail.purchaseValue.toString(),
    purchaseDate: detail.purchaseDate.toISOString(),
    yieldPercentOfBenchmark: percent?.toString() ?? null,
    notes: detail.notes,
    contributions: detail.contributions.map((row) => ({
      id: row.id,
      description: row.description,
      amount: row.amount.toString(),
      date: row.date.toISOString(),
      accountName: row.accountName,
      yieldPercentOfBenchmark: row.yieldPercentOfBenchmark?.toString() ?? null,
    })),
    cdiAnnualRatePercent: cdiRate?.toString() ?? null,
    cdiSource: cdi?.source ?? null,
    effectiveAnnualRatePercent: effective,
  };

  const accounts: AccountOptionView[] = accountsWithBalance.map((account) => ({
    id: account.id,
    name: account.name,
    balance: account.balance.toString(),
  }));

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/investments"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Investimentos
      </Link>
      <InvestmentDetailView investment={investment} accounts={accounts} />
    </div>
  );
}
