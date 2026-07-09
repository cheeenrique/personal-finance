import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { investmentService } from "@/modules/investments/service";
import { accountService } from "@/modules/accounts/service";
import { InvestmentsBoard } from "@/components/investments/investments-board";
import type { AccountOptionView, InvestmentCardView } from "@/components/investments/types";

/**
 * `/investments` — lista de produtos INVESTMENT (docs/28-INVESTMENTS.md).
 * Espelha `/financings`: Server Component lê o service direto; Decimal/Date
 * viram string na borda.
 */
export default async function InvestmentsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [investments, accountsWithBalance, cdi] = await Promise.all([
    investmentService.list(userId),
    accountService.listWithBalances(userId),
    investmentService.getCdi(),
  ]);

  const cdiRate = cdi?.annualRatePercent ?? null;

  const investmentsView: InvestmentCardView[] = investments.map((investment) => {
    const percent = investment.yieldPercentOfBenchmark;
    let effective: string | null = null;
    if (cdiRate && percent) {
      effective = new Prisma.Decimal(cdiRate).mul(percent).div(100).toFixed(4);
    }
    return {
      id: investment.id,
      name: investment.name,
      currentValue: investment.currentValue.toString(),
      yieldPercentOfBenchmark: percent?.toString() ?? null,
      effectiveAnnualRatePercent: effective,
    };
  });

  const accounts: AccountOptionView[] = accountsWithBalance.map((account) => ({
    id: account.id,
    name: account.name,
    balance: account.balance.toString(),
  }));

  return <InvestmentsBoard investments={investmentsView} accounts={accounts} />;
}
