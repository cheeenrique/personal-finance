import { Suspense } from "react";

import { auth } from "@/lib/auth";
import { reportService } from "@/modules/reports/service";
import { cardService } from "@/modules/cards/service";
import { budgetService } from "@/modules/budgets/service";
import { categoryService } from "@/modules/categories/service";
import { accountService } from "@/modules/accounts/service";
import { parseFlexibleDate } from "@/lib/date/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportsFiltersBar } from "@/components/reports/reports-filters-bar";
import { ExportCsvButton } from "@/components/reports/export-csv-button";
import { CategoryReportSection } from "@/components/reports/category-report-section";
import { CashflowSection } from "@/components/reports/cashflow-section";
import { KpiSummaryCard } from "@/components/reports/kpi-summary-card";
import { ReportSection } from "@/components/reports/report-section";
import { AccountReportTable, type AccountReportRow } from "@/components/reports/account-report-table";
import { CardReportTable, type CardReportRow } from "@/components/reports/card-report-table";
import { BudgetReportTable, type BudgetReportRow } from "@/components/reports/budget-report-table";
import { PatrimonyReportSection } from "@/components/reports/patrimony-report-section";
import { flattenCategoryOptions, buildCategoryNameMap, toEvolutionChartPoints } from "@/components/reports/report-data";
import { parseReportFilters, resolveDateRange, deriveYearMonth } from "@/components/reports/report-filters";

type ReportsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/reports` (docs/06-SCREENS.md, "Relatórios") — filtros globais na URL +
 * seis relatórios derivados de `modules/reports/service.ts` (mais
 * `cards`/`budgets`, reusados aqui como estão, sem duplicar cálculo). Server
 * Component: lê os services direto, sem passar por Server Action (só o botão
 * de export precisa disso — ver `export-csv-button.tsx`).
 */
export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const rawParams = await searchParams;
  const filters = parseReportFilters((key) => {
    const value = rawParams[key];
    return typeof value === "string" ? value : null;
  });

  return (
    <Suspense fallback={<ReportsSkeleton />}>
      <ReportsContent filters={filters} />
    </Suspense>
  );
}

async function ReportsContent({ filters }: { filters: ReturnType<typeof parseReportFilters> }) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return <p className="text-sm text-muted-foreground">Sessão inválida.</p>;
  }

  const { dateFrom, dateTo } = resolveDateRange(filters.period);
  const { year, month } = deriveYearMonth(dateTo);

  const [
    monthlyPoints,
    categoryTotalsAll,
    cashflowSummary,
    accountRows,
    patrimonyPoints,
    cardsWithSummary,
    budgetsWithProgress,
    categoryTree,
    accountsWithBalance,
  ] = await Promise.all([
    reportService.incomeVsExpenseByMonth(userId, year),
    reportService.expenseByCategory(userId, year, month),
    reportService.cashflow(userId, parseFlexibleDate(dateFrom), parseFlexibleDate(dateTo)),
    reportService.accountReport(userId, parseFlexibleDate(dateFrom), parseFlexibleDate(dateTo)),
    reportService.patrimonyEvolution(userId),
    cardService.listWithSummary(userId),
    budgetService.listWithProgress(userId, year, month),
    categoryService.listTree(userId),
    accountService.listWithBalances(userId),
  ]);

  const categoryOptions = flattenCategoryOptions(categoryTree);
  const categoryNameById = buildCategoryNameMap(categoryTree);
  const accountOptions = accountsWithBalance.map((account) => ({ value: account.id, label: account.name }));
  const cardOptions = cardsWithSummary.map((card) => ({ value: card.id, label: card.name }));

  const totalAll = categoryTotalsAll.reduce((sum, category) => sum + category.total.toNumber(), 0);
  const categoryTotals = filters.categoryId
    ? categoryTotalsAll.filter((category) => category.categoryId === filters.categoryId)
    : categoryTotalsAll;

  const accountReportRows: AccountReportRow[] = accountRows
    .filter((row) => !filters.accountId || row.accountId === filters.accountId)
    .map((row) => ({
      accountId: row.accountId,
      accountName: row.accountName,
      totalIn: row.totalIn.toNumber(),
      totalOut: row.totalOut.toNumber(),
      totalMovement: row.totalMovement.toNumber(),
    }));

  const cardReportRows: CardReportRow[] = cardsWithSummary
    .filter((card) => !filters.cardId || card.id === filters.cardId)
    .map((card) => ({
      cardId: card.id,
      cardName: card.name,
      currentInvoiceTotal: card.currentInvoiceTotal.toNumber(),
      availableLimit: card.availableLimit.toNumber(),
    }));

  const budgetReportRows: BudgetReportRow[] = budgetsWithProgress
    .filter((budget) => !filters.categoryId || budget.categoryId === filters.categoryId)
    .map((budget) => ({
      id: budget.id,
      categoryName: categoryNameById.get(budget.categoryId) ?? "—",
      plannedAmount: budget.plannedAmount.toNumber(),
      spentAmount: budget.spentAmount.toNumber(),
      progress: budget.progress,
      status: budget.status,
    }));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReportsFiltersBar categoryOptions={categoryOptions} accountOptions={accountOptions} cardOptions={cardOptions} />
        <ExportCsvButton
          filters={{
            dateFrom,
            dateTo,
            categoryId: filters.categoryId,
            accountId: filters.accountId,
            cardId: filters.cardId,
            type: filters.type,
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CategoryReportSection categories={categoryTotals} totalAll={totalAll} />
        <CashflowSection monthlyPoints={monthlyPoints} />
        <KpiSummaryCard
          income={cashflowSummary.income.toNumber()}
          expense={cashflowSummary.expense.toNumber()}
          net={cashflowSummary.net.toNumber()}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportSection title="Por conta">
          <AccountReportTable rows={accountReportRows} />
        </ReportSection>

        <ReportSection title="Por cartão">
          <CardReportTable rows={cardReportRows} />
        </ReportSection>
      </div>

      <ReportSection title="Orçamento vs. realizado">
        <BudgetReportTable rows={budgetReportRows} />
      </ReportSection>

      <PatrimonyReportSection points={toEvolutionChartPoints(patrimonyPoints)} />
    </div>
  );
}

function ReportsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-[38px] w-full max-w-xl" />
        <Skeleton className="h-8 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>

      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
