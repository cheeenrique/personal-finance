import type { IncomeExpenseMonthPoint } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppLineChart, type LineChartPoint } from "@/components/shared/charts/line-chart";

/**
 * Array fixo (sem `Date`/`timeZone`) — `new Date(year, month - 1, 1)` formatado
 * com `timeZone: "America/Sao_Paulo"` num servidor UTC volta pro dia 31 do mês
 * anterior e o formatter exibe o mês ERRADO. `month` é 1-12.
 */
const MONTHS_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthLabel(year: number, month: number): string {
  return MONTHS_ABBR[month - 1];
}

type MonthlyEvolutionChartProps = {
  points: IncomeExpenseMonthPoint[];
};

/**
 * "Evolução mensal" — receita vs. despesa dos meses já decorridos do ano
 * atual (docs/11-DASHBOARD.md, "5. Gráficos e Análises"). `empty` é decidido
 * por MOVIMENTAÇÃO real, não por tamanho do array — a série vem sempre
 * zero-preenchida (`reportService.cashflowByMonth`, base de caixa que bate
 * com os KPIs do Dashboard), então `points.length` nunca é 0.
 */
export function MonthlyEvolutionChart({ points }: MonthlyEvolutionChartProps) {
  const hasMovement = points.some((point) => !point.income.isZero() || !point.expense.isZero());

  const data: LineChartPoint[] = points.map((point) => ({
    label: monthLabel(point.year, point.month),
    income: point.income.toNumber(),
    expense: point.expense.toNumber(),
  }));

  return (
    <ChartWrapper
      title="Evolução mensal"
      empty={!hasMovement}
      emptyMessage="Nenhuma movimentação registrada este ano ainda."
      height={300}
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
