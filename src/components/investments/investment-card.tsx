import Link from "next/link";
import { Eye, Plus, TrendingUp } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import type { InvestmentCardView } from "./types";

type InvestmentCardProps = { investment: InvestmentCardView };

/**
 * Card de investimento na grid de `/investments` — posição, badge % CDI,
 * taxa efetiva estimada. "Detalhes" no padrão neutral das ações rápidas.
 */
export function InvestmentCard({ investment }: InvestmentCardProps) {
  const percentLabel = investment.yieldPercentOfBenchmark
    ? `${Number(investment.yieldPercentOfBenchmark).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% CDI`
    : null;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-extrabold text-foreground">{investment.name}</p>
          {percentLabel && (
            <span className="mt-1 inline-flex rounded-full bg-success/16 px-2 py-0.5 text-[10.5px] font-bold text-success">
              {percentLabel}
            </span>
          )}
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-success/16">
          <TrendingUp className="size-4 text-success" aria-hidden="true" />
        </span>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground">Posição</p>
        <p className="font-mono text-lg font-extrabold text-foreground">{formatBRL(investment.currentValue)}</p>
        {investment.effectiveAnnualRatePercent && (
          <p className="mt-1 text-[11.5px] font-semibold text-muted-foreground">
            ≈ {Number(investment.effectiveAnnualRatePercent).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            a.a. (estimativa)
          </p>
        )}
      </div>

      <Link
        href={`/investments/${investment.id}`}
        className={cn(
          buttonVariants({
            variant: "neutral",
            className: "mt-1 h-9 w-full gap-[7px] rounded-[10px] px-3.5 text-[13px] font-bold",
          }),
        )}
      >
        <Eye className="size-[15px]" strokeWidth={2} aria-hidden="true" />
        Detalhes
      </Link>
    </div>
  );
}

export function NewInvestmentTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-success/16">
        <Plus className="size-5 text-success" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Novo investimento</span>
    </button>
  );
}
