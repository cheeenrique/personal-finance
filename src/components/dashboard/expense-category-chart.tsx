import type { CategoryExpenseTotal } from "@/modules/transactions/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { AppDonutChart, type DonutChartSlice } from "@/components/shared/charts/donut-chart";
import { resolveCategoryColor } from "@/components/shared/charts/category-palette";
import { formatBRL } from "@/lib/money/format";

type ExpenseCategoryChartProps = {
  categories: CategoryExpenseTotal[];
};

/**
 * "Gastos por categoria" do mês atual — donut à esquerda + lista ranqueada à
 * direita (docs/11-DASHBOARD.md, "5. Gráficos e Análises"). Todas as
 * categorias aparecem, sem agrupar em "Outros" — a lista é quem escala com
 * volume (scroll interno), não o donut.
 */
export function ExpenseCategoryChart({ categories }: ExpenseCategoryChartProps) {
  const sorted = [...categories].sort((a, b) => b.total.toNumber() - a.total.toNumber());

  const slices: DonutChartSlice[] = sorted.map((category, index) => ({
    label: category.categoryName,
    value: category.total.toNumber(),
    color: resolveCategoryColor(index),
  }));

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const isEmpty = slices.length === 0;

  return (
    <ChartWrapper
      title="Gastos por categoria"
      empty={isEmpty}
      emptyMessage="Nenhum gasto registrado neste mês ainda."
      height={300}
    >
      <div className="flex h-full flex-col gap-4 sm:flex-row">
        <div className="relative mx-auto aspect-square w-full max-w-[200px] shrink-0 sm:mx-0 sm:aspect-auto sm:h-full sm:w-[42%] sm:max-w-none">
          <AppDonutChart
            data={slices}
            centerLabel={
              <>
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Total
                </span>
                <span className="font-mono text-[15px] font-semibold text-foreground">
                  {formatBRL(total)}
                </span>
              </>
            }
          />
        </div>

        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
          {slices.map((slice) => (
            <CategoryRankRow
              key={slice.label}
              slice={slice}
              percent={total > 0 ? (slice.value / total) * 100 : 0}
            />
          ))}
        </ul>
      </div>
    </ChartWrapper>
  );
}

function CategoryRankRow({ slice, percent }: { slice: DonutChartSlice; percent: number }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[12px] leading-tight odd:bg-secondary/40">
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: slice.color }}
          aria-hidden="true"
        />
        <span className="truncate font-medium text-foreground">{slice.label}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-2 font-mono tabular-nums">
        <span className="text-foreground">{formatBRL(slice.value)}</span>
        <span className="w-11 text-right text-muted-foreground">{percent.toFixed(1)}%</span>
      </span>
    </li>
  );
}
