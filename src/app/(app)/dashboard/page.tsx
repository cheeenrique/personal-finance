import { Suspense } from "react";

import { auth } from "@/lib/auth";
import { AlertType } from "@/generated/prisma/enums";
import { accountService } from "@/modules/accounts/service";
import { transactionService } from "@/modules/transactions/service";
import { alertService } from "@/modules/alerts/service";
import { assetService } from "@/modules/assets/service";
import { cardService } from "@/modules/cards/service";
import { loanService } from "@/modules/loans/service";
import { reportService } from "@/modules/reports/service";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { parseFlexibleDate } from "@/lib/date/schema";
import { PERIOD_OPTIONS, type PeriodPreset } from "@/components/transactions/period-presets";
import { resolveDateRange, deriveYearMonth } from "@/components/reports/report-filters";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { DashboardPeriodSelect } from "@/components/dashboard/period-select";
import { WeeklySummaryBox } from "@/components/dashboard/weekly-summary-box";
import { AlertsSection } from "@/components/dashboard/alerts-section";
import { InsufficientBalanceAlert } from "@/components/dashboard/insufficient-balance-alert";
import { KPIGrid, type KPIGridData } from "@/components/dashboard/kpi-grid";
import { CardsSummary } from "@/components/dashboard/cards-summary";
import { InstallmentsSummary } from "@/components/dashboard/installments-summary";
import { LoansSummary } from "@/components/dashboard/loans-summary";
import { ExpenseCategoryChart } from "@/components/dashboard/expense-category-chart";
import { MonthlyEvolutionChart } from "@/components/dashboard/monthly-evolution-chart";
import { MoneyFlowSankeyChart } from "@/components/dashboard/money-flow-sankey-chart";
import { RecentTransactionsTable } from "@/components/dashboard/recent-transactions-table";

const RECENT_TRANSACTIONS_LIMIT = 5;
const DEFAULT_PERIOD: PeriodPreset = "this_month";
const VALID_PERIODS = new Set<string>(PERIOD_OPTIONS.map((option) => option.value));

/** Valida `?period=` contra os presets conhecidos (`PERIOD_OPTIONS`) — qualquer valor fora disso (adulterado ou stale) cai no default, nunca propaga string arbitrária pro `resolveDateRange`. */
function parsePeriod(raw: string | string[] | undefined): PeriodPreset {
  return typeof raw === "string" && VALID_PERIODS.has(raw) ? (raw as PeriodPreset) : DEFAULT_PERIOD;
}

/** `?dateFrom=`/`?dateTo=` — só fazem sentido junto de `period=custom` (docs/50-AUDITORIA-BACKLOG.md F12); `resolveDateRange` ignora quando o período não é "custom". */
function parseCustomDate(raw: string | string[] | undefined): string | undefined {
  return typeof raw === "string" && raw ? raw : undefined;
}

type DashboardPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/dashboard` — tela principal (docs/11-DASHBOARD.md): responde "como está
 * minha vida financeira agora" sem navegação adicional. Página é só
 * composição — toda regra de negócio vive nos services de cada módulo
 * (docs/99-CLAUDE.md, "Regra de Ouro"). Filtro de período na URL (`?period=`,
 * default "this_month" — mesma convenção de `/reports`, ver
 * `components/reports/report-filters.ts`): parseado FORA do `Suspense` (rápido,
 * síncrono), repassado pro conteúdo async que faz o fetch pesado.
 */
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const rawParams = await searchParams;
  const period = parsePeriod(rawParams.period);
  const customFrom = parseCustomDate(rawParams.dateFrom);
  const customTo = parseCustomDate(rawParams.dateTo);

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent period={period} customFrom={customFrom} customTo={customTo} />
    </Suspense>
  );
}

type DashboardContentProps = { period: PeriodPreset; customFrom: string | undefined; customTo: string | undefined };

async function DashboardContent({ period, customFrom, customTo }: DashboardContentProps) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return <p className="text-sm text-muted-foreground">Sessão inválida.</p>;
  }

  // Range do período selecionado (docs/11-DASHBOARD.md + task do filtro de
  // período) — reusa o mesmo resolver de `/reports`, sem duplicar a lógica de
  // presets (rule 02-dry-kiss-yagni). `year` do gráfico de evolução mensal
  // segue o ANO do período (fim do range), não necessariamente o ano corrente.
  const { dateFrom, dateTo } = resolveDateRange(period, { dateFrom: customFrom, dateTo: customTo });
  const parsedDateFrom = parseFlexibleDate(dateFrom);
  const parsedDateTo = parseFlexibleDate(dateTo);
  const { year } = deriveYearMonth(dateTo);

  const [
    insufficientBalanceReport,
    totalBalance,
    cashflowSummary,
    unpaidExpense,
    totalPatrimony,
    weeklySummary,
    activeAlertsRaw,
    cards,
    installmentPurchases,
    activeLoans,
    expenseByCategory,
    incomeVsExpenseByMonth,
    moneyFlow,
    recentTransactions,
  ] = await Promise.all([
    accountService.getInsufficientBalanceReport(userId),
    accountService.totalBalance(userId),
    // Fluxo de caixa CORRETO do período selecionado (conta-only + COALESCE(paidAt,
    // date)) — MESMA semântica de `monthlyIncomeTotal`/`monthlyExpenseTotal` que o
    // Dashboard usava antes (ver `modules/reports/repository.ts` `buildCashflowConditions`
    // vs `modules/transactions/repository.ts` `sumAmountByTypeInRange`: mesmas
    // condições de exclusão), só que sobre um range arbitrário em vez de só o mês.
    reportService.cashflow(userId, parsedDateFrom, parsedDateTo),
    // "Previsto / A pagar" no range do período (isPaid=false) — generalização de
    // `monthlyUnpaidExpenseTotal` pro filtro (ver `modules/transactions/service.ts`).
    transactionService.unpaidExpenseTotalInRange(userId, parsedDateFrom, parsedDateTo),
    assetService.totalPatrimony(userId),
    alertService.getWeeklySummaryForDashboard(userId),
    alertService.listActiveForDashboard(userId),
    cardService.listWithSummary(userId),
    transactionService.listActiveInstallmentPurchases(userId),
    loanService.listActiveLoans(userId),
    // "Gastos por categoria" no range do período — `reportService.categoryTotals`
    // já implementa exatamente esta agregação pra um range arbitrário, agora
    // alinhada à MESMA regra de fluxo de caixa do KPI "Despesas do mês" acima
    // (conta-only + `COALESCE(paidAt, date)`, ver `modules/reports/repository.ts`
    // `groupCategoryTotalsInRange`) — soma bate exato com `monthlyExpense`, sem
    // cartão nem parcela paga adiantada contando fora do mês. Sem filtro de tipo
    // ⇒ default EXPENSE (mesma leitura de sempre). Extensão de fim de dia agora é
    // interna a `categoryTotals` (`endOfDayInclusive`), sem precisar do wrap aqui.
    reportService.categoryTotals(userId, parsedDateFrom, parsedDateTo),
    reportService.incomeVsExpenseByMonth(userId, year),
    // "Fluxo de dinheiro" (Sankey) do período selecionado — MESMA base de
    // caixa de `categoryTotals` acima (reusada nos dois sentidos, ver
    // `modules/reports/service.ts` `sankeyFlow` pro detalhe de quando essa
    // soma diverge do KPI de cash-flow: transação sem categoria).
    reportService.sankeyFlow(userId, parsedDateFrom, parsedDateTo),
    transactionService.listRecentForDashboard(userId, RECENT_TRANSACTIONS_LIMIT),
  ]);

  const kpiData: KPIGridData = {
    totalBalance: totalBalance.toNumber(),
    monthlyIncome: cashflowSummary.income.toNumber(),
    monthlyExpense: cashflowSummary.expense.toNumber(),
    unpaidExpense: unpaidExpense.toNumber(),
    monthlyResult: cashflowSummary.net.toNumber(),
    totalPatrimony: totalBalance.plus(totalPatrimony).toNumber(),
  };

  // WEEKLY_SUMMARY já tem o box dedicado acima — não duplicar na lista de
  // alertas ativos (docs/29-ALERTS.md, "Interface no Dashboard": só anomalia/verde).
  const activeAlerts = activeAlertsRaw.filter((alert) => alert.type !== AlertType.WEEKLY_SUMMARY);

  // Só os meses já decorridos do ANO CORRENTE — série zero-preenchida evita
  // meses futuros "achatados" em zero na linha do tempo. Anos passados (ex.:
  // período "Este ano" olhando pra trás não existe hoje, mas `incomeVsExpenseByMonth`
  // é sempre o ano do período, que pode divergir do ano corrente em casos de borda
  // como "Mês passado" em janeiro) mostram os 12 meses cheios — mesmo tratamento
  // de `/reports` (`cashflowPoints`).
  const nowMonth = nowInSaoPaulo();
  const monthlyEvolutionPoints =
    year === nowMonth.getFullYear() ? incomeVsExpenseByMonth.slice(0, nowMonth.getMonth() + 1) : incomeVsExpenseByMonth;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <QuickActions />
        <DashboardPeriodSelect period={period} customFrom={customFrom} customTo={customTo} />
      </div>

      {weeklySummary && <WeeklySummaryBox summary={weeklySummary} />}

      <InsufficientBalanceAlert
        deficitTotal={insufficientBalanceReport.deficitTotal}
        items={insufficientBalanceReport.items}
      />

      <AlertsSection alerts={activeAlerts} />

      <KPIGrid data={kpiData} period={period} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardsSummary cards={cards} />
        <InstallmentsSummary purchases={installmentPurchases} />
        <LoansSummary loans={activeLoans} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpenseCategoryChart categories={expenseByCategory} />
        <MonthlyEvolutionChart points={monthlyEvolutionPoints} />
      </div>

      <MoneyFlowSankeyChart data={moneyFlow} />

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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <Skeleton className="h-[340px] w-full rounded-xl" />

      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
