import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";

type KPICardProps = {
  icon: LucideIcon;
  title: string;
  /** Valor já formatado em BRL na borda — nunca float cru (docs/06-SCREENS.md, "KPICard"). */
  value: string;
  /** Cor do valor/variação — semântica financeira do card, não sempre "verde=bom" (ex.: Despesas subindo é vermelho mesmo sendo positivo). */
  tone?: "success" | "danger" | "warning" | "transfer" | "asset" | "neutral";
  variation?: {
    label: string;
    direction: "up" | "down";
    positive: boolean;
  };
  loading?: boolean;
  className?: string;
};

const TONE_CLASSES: Record<NonNullable<KPICardProps["tone"]>, string> = {
  success: "bg-success/16 text-success",
  danger: "bg-destructive/16 text-destructive",
  warning: "bg-warning/16 text-warning",
  transfer: "bg-transfer/16 text-on-transfer",
  asset: "bg-asset/16 text-on-asset",
  neutral: "bg-primary/16 text-primary",
};

const VALUE_TONE_CLASSES: Record<NonNullable<KPICardProps["tone"]>, string> = {
  success: "text-success",
  danger: "text-destructive",
  warning: "text-warning",
  transfer: "text-on-transfer",
  asset: "text-on-asset",
  neutral: "text-foreground",
};

/**
 * Usado no Dashboard e em telas de detalhe (Contas, Cartões). Nunca mostra
 * mais de uma informação principal por card (docs/04-DESIGN_SYSTEM.md, "KPI
 * Cards").
 */
export function KPICard({
  icon: Icon,
  title,
  value,
  tone = "neutral",
  variation,
  loading = false,
  className,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "flex min-h-[160px] flex-col gap-3 rounded-xl border border-border bg-card p-5",
        CARD_SHADOW_CLASS,
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-[10px]",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-bold text-muted-foreground">{title}</span>
      </div>

      {loading ? (
        <div className="mt-auto space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ) : (
        <div className="mt-auto">
          <p className={cn("font-mono text-2xl font-semibold", VALUE_TONE_CLASSES[tone])}>
            {value}
          </p>
          {variation && (
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold",
                variation.positive ? "text-success" : "text-destructive",
              )}
            >
              {variation.direction === "up" ? (
                <ArrowUp className="size-3" aria-hidden="true" />
              ) : (
                <ArrowDown className="size-3" aria-hidden="true" />
              )}
              {variation.label}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
