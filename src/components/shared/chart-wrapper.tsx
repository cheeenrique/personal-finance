import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";

type ChartWrapperProps = {
  title: string;
  legend?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
  className?: string;
  height?: number;
  /**
   * Sobrescreve a altura fixa (`height`) por classes Tailwind responsivas —
   * ex.: `"min-h-[480px] sm:h-[300px] sm:min-h-0"` pra um card que no mobile
   * cresce com o conteúdo (lista longa) e no desktop trava. Quando passado,
   * o `height` inline é ignorado. Charts recharts continuam usando `height`
   * (precisam de altura fixa pro ResponsiveContainer).
   */
  heightClassName?: string;
};

/**
 * Camada comum sobre a lib de gráficos (recharts), usada em Dashboard,
 * Reports, Assets, Cards, Budgets (docs/06-SCREENS.md, "Chart Wrapper").
 * `loading`/`empty` sempre substituem o gráfico, nunca o deixam quebrado.
 */
export function ChartWrapper({
  title,
  legend,
  loading = false,
  empty = false,
  emptyMessage = "Nenhum dado disponível para este período.",
  children,
  className,
  height = 260,
  heightClassName,
}: ChartWrapperProps) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card", CARD_SHADOW_CLASS, className)}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]">
        <h3 className="text-sm font-extrabold text-foreground">{title}</h3>
        {legend && <div className="flex items-center gap-3 text-[11.5px] font-bold">{legend}</div>}
      </div>

      <div className={cn("p-[18px]", heightClassName)} style={heightClassName ? undefined : { height }}>
        {loading ? (
          <Skeleton className="size-full" />
        ) : empty ? (
          <div className="flex size-full items-center justify-center text-center text-[13px] font-medium text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
