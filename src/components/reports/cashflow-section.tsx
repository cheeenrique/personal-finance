import type { IncomeExpenseMonthPoint } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppLineChart, type LineChartPoint } from "@/components/shared/charts/line-chart";

/**
 * Array fixo (sem `Date`/`timeZone`) — mesma receita de
 * `dashboard/monthly-evolution-chart.tsx` `monthLabel` (não exportada de lá,
 * recriada aqui). `new Date(year, month - 1, 1)` formatado com
 * `timeZone: "America/Sao_Paulo"` num servidor UTC volta pro dia 31 do mês
 * anterior e exibia o mês ERRADO. `month` é 1-12.
 */
const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(year: number, month: number): string {
  return MONTHS_ABBR[month - 1];
}

type CashflowSectionProps = {
  /** Série dos 12 meses do ano de referência (`reportService.cashflowByMonth` — conta-only + `COALESCE(paidAt, date)`, mesma base de caixa do Dashboard) — o range de datas do filtro não se aplica aqui, o endpoint só aceita `year` inteiro. */
  monthlyPoints: IncomeExpenseMonthPoint[];
};

/**
 * "Fluxo de Caixa" (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa") — a
 * série mensal (`reportService.cashflowByMonth`) vira a linha. `AppLineChart`
 * já é o componente documentado como reusado pelo Dashboard e por Reports (ver
 * seu próprio comentário de doc). Os 3 KPIs do período (Receitas/Despesas/Saldo)
 * viraram card próprio (`kpi-summary-card.tsx`) — rebalanceamento visual da
 * linha 1 de `/reports`, ver `page.tsx`.
 */
export function CashflowSection({ monthlyPoints }: CashflowSectionProps) {
  const hasMovement = monthlyPoints.some((point) => !point.income.isZero() || !point.expense.isZero());
  const data: LineChartPoint[] = monthlyPoints.map((point) => ({
    label: monthLabel(point.year, point.month),
    income: point.income.toNumber(),
    expense: point.expense.toNumber(),
  }));

  return (
    <ChartWrapper
      title="Fluxo de caixa"
      height={280}
      empty={!hasMovement}
      emptyMessage="Nenhuma movimentação registrada neste ano ainda."
      legend={
        <>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" aria-hidden="true" />
            Receitas
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
            Despesas
          </span>
        </>
      }
    >
      <AppLineChart data={data} />
    </ChartWrapper>
  );
}
