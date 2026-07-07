import type { IncomeExpenseMonthPoint } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppLineChart, type LineChartPoint } from "@/components/shared/charts/line-chart";
import { TIMEZONE } from "@/lib/date/timezone";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: TIMEZONE });

function monthLabel(year: number, month: number): string {
  const label = MONTH_LABEL_FORMATTER.format(new Date(year, month - 1, 1));
  return label.replace(".", "").replace(/^\w/, (char) => char.toUpperCase());
}

type MonthlyEvolutionChartProps = {
  points: IncomeExpenseMonthPoint[];
};

/**
 * "Evolução mensal" — receita vs. despesa dos meses já decorridos do ano
 * atual (docs/11-DASHBOARD.md, "5. Gráficos e Análises"). `empty` é decidido
 * por MOVIMENTAÇÃO real, não por tamanho do array — a série vem sempre
 * zero-preenchida (`reportService.incomeVsExpenseByMonth`), então
 * `points.length` nunca é 0.
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
