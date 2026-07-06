import { Suspense } from "react";

import { auth } from "@/lib/auth";
import { AlertType } from "@/generated/prisma/enums";
import { accountService } from "@/modules/accounts/service";
import { transactionService } from "@/modules/transactions/service";
import { alertService } from "@/modules/alerts/service";
import { assetService } from "@/modules/assets/service";
import { cardService } from "@/modules/cards/service";
import { reportService } from "@/modules/reports/service";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { WeeklySummaryBox } from "@/components/dashboard/weekly-summary-box";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { KPIGrid, type KPIGridData } from "@/components/dashboard/kpi-grid";
import { CardsSummary } from "@/components/dashboard/cards-summary";
import { InstallmentsSummary } from "@/components/dashboard/installments-summary";
import { ExpenseCategoryChart } from "@/components/dashboard/expense-category-chart";
import { MonthlyEvolutionChart } from "@/components/dashboard/monthly-evolution-chart";
import { RecentTransactionsTable } from "@/components/dashboard/recent-transactions-table";

const RECENT_TRANSACTIONS_LIMIT = 5;

/**
 * `/dashboard` — tela principal (docs/11-DASHBOARD.md): responde "como está
 * minha vida financeira agora" sem navegação adicional. Página é só
 * composição — toda regra de negócio vive nos services de cada módulo
 * (docs/99-CLAUDE.md, "Regra de Ouro"). `Suspense` cobre o fetch (várias
 * queries em paralelo) com um skeleton de tela inteira.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}

async function DashboardContent() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return <p className="text-sm text-muted-foreground">Sessão inválida.</p>;
  }

  const now = nowInSaoPaulo();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [
    totalBalance,
    monthlyIncome,
    monthlyExpense,
    unpaidExpense,
    totalPatrimony,
    weeklySummary,
    activeAlertsRaw,
    cards,
    installmentPurchases,
    expenseByCategory,
    incomeVsExpenseByMonth,
    recentTransactions,
  ] = await Promise.all([
    accountService.totalBalance(userId),
    transactionService.monthlyIncomeTotal(userId, year, month),
    transactionService.monthlyExpenseTotal(userId, year, month),
    transactionService.monthlyUnpaidExpenseTotal(userId, year, month),
    assetService.totalPatrimony(userId),
    alertService.getWeeklySummaryForDashboard(userId),
    alertService.listActiveForDashboard(userId),
    cardService.listWithSummary(userId),
    transactionService.listActiveInstallmentPurchases(userId),
    reportService.expenseByCategory(userId, year, month),
    reportService.incomeVsExpenseByMonth(userId, year),
    transactionService.listRecentForDashboard(userId, RECENT_TRANSACTIONS_LIMIT),
  ]);

  const kpiData: KPIGridData = {
    totalBalance: totalBalance.toNumber(),
    monthlyIncome: monthlyIncome.toNumber(),
    monthlyExpense: monthlyExpense.toNumber(),
    unpaidExpense: unpaidExpense.toNumber(),
    monthlyResult: monthlyIncome.minus(monthlyExpense).toNumber(),
    totalPatrimony: totalBalance.plus(totalPatrimony).toNumber(),
  };

  // WEEKLY_SUMMARY já tem o box dedicado acima — não duplicar na lista de
  // alertas ativos (docs/29-ALERTS.md, "Interface no Dashboard": só anomalia/verde).
  const activeAlerts = activeAlertsRaw.filter((alert) => alert.type !== AlertType.WEEKLY_SUMMARY);

  // Só os meses já decorridos do ano corrente — série zero-preenchida evita
  // meses futuros "achatados" em zero na linha do tempo.
  const monthlyEvolutionPoints = incomeVsExpenseByMonth.slice(0, month);

  return (
    <div className="flex flex-col gap-5">
      <QuickActions />

      {weeklySummary && <WeeklySummaryBox summary={weeklySummary} />}

      <AlertsSection alerts={activeAlerts} />

      <KPIGrid data={kpiData} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardsSummary cards={cards} />
        <InstallmentsSummary purchases={installmentPurchases} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpenseCategoryChart categories={expenseByCategory} />
        <MonthlyEvolutionChart points={monthlyEvolutionPoints} />
      </div>

      <RecentTransactionsTable
        transactions={recentTransactions.map((transaction) => ({
          ...transaction,
          amount: transaction.amount.toString(),
        }))}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2.5">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-36 rounded-lg" />
        ))}
      </div>

      <Skeleton className="h-48 w-full rounded-xl" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-40 w-full rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
