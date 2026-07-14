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
  success: "bg-success/16 text-on-success",
  danger: "bg-destructive/16 text-on-danger",
  warning: "bg-warning/16 text-on-warning",
  transfer: "bg-transfer/16 text-on-transfer",
  asset: "bg-asset/16 text-on-asset",
  neutral: "bg-primary/18 text-on-primary",
};

const VALUE_TONE_CLASSES: Record<NonNullable<KPICardProps["tone"]>, string> = {
  success: "text-on-success",
  danger: "text-on-danger",
  warning: "text-on-warning",
  transfer: "text-on-transfer",
  asset: "text-on-asset",
  /** Saldo (neutro) mantém o texto padrão — só o ícone leva `on-primary`
   * (design/Personal Finance App.dc.html, card "Saldo atual"). */
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
        "flex min-w-0 flex-col rounded-xl border border-border bg-card p-[18px]",
        CARD_SHADOW_CLASS,
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-bold text-muted-foreground">{title}</span>
        <span
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-[9px]",
            TONE_CLASSES[tone],
          )}
        >
          <Icon className="size-[15px]" aria-hidden="true" />
        </span>
      </div>

      {loading ? (
        <div className="mt-3 space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ) : (
        <>
          <p
            className={cn(
              "mt-3 font-mono text-[18px] font-semibold tabular-nums sm:text-[22px] lg:text-[25px]",
              VALUE_TONE_CLASSES[tone],
            )}
          >
            {value}
          </p>
          {variation && (
            <p
              className={cn(
                "mt-[5px] inline-flex items-center gap-[5px] text-xs font-bold",
                variation.positive ? "text-on-success" : "text-on-danger",
              )}
            >
              {variation.direction === "up" ? (
                <ArrowUp className="size-[13px]" aria-hidden="true" strokeWidth={2.4} />
              ) : (
                <ArrowDown className="size-[13px]" aria-hidden="true" strokeWidth={2.4} />
              )}
              {variation.label}
            </p>
          )}
        </>
      )}
    </div>
  );
}
