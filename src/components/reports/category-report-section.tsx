import type { CategoryExpenseTotal } from "@/modules/reports/types";
import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { ProgressBar } from "@/components/dashboard/progress-bar";
import { formatBRL } from "@/lib/money/format";

type CategoryReportSectionProps = {
  /** Já filtrado por `categoryId` (se selecionado) — ver `page.tsx`. */
  categories: CategoryExpenseTotal[];
  /** Total SEM o filtro de categoria — base do percentual da barra (uma categoria isolada não vira 100% sozinha). */
  totalAll: number;
};

/**
 * "Categorias" (docs/28-REPORTS.md, "Relatório de Categorias") — barra
 * horizontal, não donut (esse já existe no Dashboard). `ProgressBar`
 * (@/components/dashboard/progress-bar) é genérico o bastante pra reusar aqui
 * sem duplicar desenho de barra.
 */
export function CategoryReportSection({ categories, totalAll }: CategoryReportSectionProps) {
  const isEmpty = categories.length === 0;

  return (
    <ChartWrapper
      title="Categorias"
      empty={isEmpty}
      emptyMessage="Nenhum gasto por categoria neste período."
      height={Math.max(220, categories.length * 44)}
    >
      <ul className="flex h-full flex-col justify-center gap-3 overflow-y-auto">
        {categories.map((category) => {
          const total = category.total.toNumber();
          const percent = totalAll > 0 ? (total / totalAll) * 100 : 0;

          return (
            <li key={category.categoryId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[13px] font-semibold">
                <span className="truncate">{category.categoryName}</span>
                <span className="font-mono whitespace-nowrap text-muted-foreground">{formatBRL(total)}</span>
              </div>
              <ProgressBar percent={percent} label={`${percent.toFixed(0)}% do total`} tone="accent" />
            </li>
          );
        })}
      </ul>
    </ChartWrapper>
  );
}
