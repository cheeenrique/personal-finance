import type { CategoryExpenseTotal } from "@/modules/transactions/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppDonutChart, type DonutChartSlice } from "@/components/shared/charts/donut-chart";
import { cn } from "@/lib/utils";

/** Paleta cíclica pra N categorias — tokens do design system (docs/04-DESIGN_SYSTEM.md, "Gráficos"). */
const PALETTE = [
  "var(--primary)",
  "var(--accent)",
  "var(--warning)",
  "var(--transfer)",
  "var(--asset)",
  "var(--success)",
  "var(--destructive)",
];

type ExpenseCategoryChartProps = {
  categories: CategoryExpenseTotal[];
};

/** "Gastos por categoria" do mês atual — donut (docs/11-DASHBOARD.md, "5. Gráficos e Análises"). */
export function ExpenseCategoryChart({ categories }: ExpenseCategoryChartProps) {
  const slices: DonutChartSlice[] = categories.map((category, index) => ({
    label: category.categoryName,
    value: category.total.toNumber(),
    color: PALETTE[index % PALETTE.length],
  }));

  const isEmpty = slices.length === 0;

  return (
    <ChartWrapper
      title="Gastos por categoria"
      empty={isEmpty}
      emptyMessage="Nenhum gasto registrado neste mês ainda."
      legend={
        !isEmpty && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {slices.map((slice) => (
              <span key={slice.label} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className={cn("size-2 rounded-full")}
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                {slice.label}
              </span>
            ))}
          </div>
        )
      }
    >
      <AppDonutChart data={slices} />
    </ChartWrapper>
  );
}
