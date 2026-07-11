import { TrendingUp } from "lucide-react";

import { SectionCard } from "./section-card";
import { EmptyState } from "@/components/shared/empty-state";
import { formatBRL } from "@/lib/money/format";
import type { CategoryTrend } from "@/modules/insights/types";

type CategoryTrendsCardProps = {
  rising: CategoryTrend[];
};

const MAX_VISIBLE_TRENDS = 5;

/**
 * "Tendências" — categorias com gasto do mês bem acima da média dos meses
 * anteriores (`insightsService.categoryTrends`, já filtrado/ordenado por
 * `deltaPct` desc no service — nenhum recálculo aqui, regra de ouro
 * docs/99-CLAUDE.md). Tom vermelho (`on-danger`) na variação — gasto subindo
 * é sempre uma despesa, mesma semântica de "Despesa" no design system.
 */
export function CategoryTrendsCard({ rising }: CategoryTrendsCardProps) {
  if (rising.length === 0) {
    return (
      <SectionCard title="Tendências">
        <EmptyState
          icon={TrendingUp}
          title="Nenhuma categoria em alta"
          description="Quando um gasto subir bem acima da média dos últimos meses, ele aparece aqui."
          className="min-h-0 border-none py-2"
        />
      </SectionCard>
    );
  }

  const visibleTrends = rising.slice(0, MAX_VISIBLE_TRENDS);

  return (
    <SectionCard title="Tendências">
      <ul className="flex flex-col gap-3">
        {visibleTrends.map((trend) => (
          <li key={trend.categoryId} className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-foreground">{trend.categoryName}</span>
            <span className="flex shrink-0 items-baseline gap-2 font-mono text-xs">
              <span className="text-muted-foreground">{formatBRL(trend.current)}</span>
              <span className="inline-flex items-center gap-0.5 font-bold text-on-danger">
                ▲ {Math.round(trend.deltaPct)}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
