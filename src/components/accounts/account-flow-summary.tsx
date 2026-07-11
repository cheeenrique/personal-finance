"use client";

import { motion, useReducedMotion } from "framer-motion";

import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { PF_EASE_OUT } from "@/components/imports/import-motion";

type AccountFlowSummaryProps = {
  /** "Mês atual (jul/2026)", "Últimos 3 meses"… (`accountPeriodFullLabel`). */
  periodLabel: string;
  income: string;
  expense: string;
  loading?: boolean;
};

/**
 * "Fluxo do período" (handoff "Conta (Detalhe)", 2º card novo além dos KPIs)
 * — resultado líquido do período + barra de proporção entradas vs. saídas.
 * Barra anima de 0 → largura real no mount (`scaleX`, mesma curva
 * `PF_EASE_OUT` do resto do import) e respeita `prefers-reduced-motion` via
 * `useReducedMotion` (framer-motion), não tw-animate-css: a largura é
 * DERIVADA de `income`/`expense` (não uma classe estática), então precisa de
 * uma animação orientada a valor.
 */
export function AccountFlowSummary({ periodLabel, income, expense, loading }: AccountFlowSummaryProps) {
  const prefersReducedMotion = useReducedMotion();
  const incomeValue = Number(income);
  const expenseValue = Number(expense);
  const total = incomeValue + expenseValue;
  const incomePercent = total > 0 ? (incomeValue / total) * 100 : 50;
  const expensePercent = total > 0 ? (expenseValue / total) * 100 : 50;
  const net = incomeValue - expenseValue;
  const netTone = net >= 0 ? "text-on-success" : "text-on-danger";

  return (
    <div className={cn("rounded-xl border border-border bg-card p-[18px]", CARD_SHADOW_CLASS)}>
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <p className="text-sm font-extrabold text-foreground">Fluxo do período</p>
          <span className="text-xs font-semibold text-muted-foreground">{periodLabel}</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-muted-foreground">Resultado</span>
          {loading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <span className={cn("font-mono text-lg font-semibold", netTone)}>
              {net >= 0 ? "+ " : "- "}
              {formatBRL(Math.abs(net))}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-3.5 w-full rounded-full" />
      ) : (
        <div
          role="img"
          aria-label={`Entradas ${Math.round(incomePercent)}%, saídas ${Math.round(expensePercent)}% do período`}
          className="flex h-3.5 w-full overflow-hidden rounded-full bg-secondary"
        >
          <motion.div
            className="bg-success"
            style={{ width: `${incomePercent}%`, transformOrigin: "left" }}
            initial={prefersReducedMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, ease: PF_EASE_OUT }}
          />
          <motion.div
            className="bg-destructive"
            style={{ width: `${expensePercent}%`, transformOrigin: "left" }}
            initial={prefersReducedMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, ease: PF_EASE_OUT, delay: prefersReducedMotion ? 0 : 0.1 }}
          />
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="size-[9px] shrink-0 rounded-full bg-on-success" aria-hidden="true" />
          <span className="text-xs font-semibold text-muted-foreground">Entradas</span>
          <span className="font-mono text-[13px] font-semibold text-on-success">{formatBRL(income)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="size-[9px] shrink-0 rounded-full bg-on-danger" aria-hidden="true" />
          <span className="text-xs font-semibold text-muted-foreground">Saídas</span>
          <span className="font-mono text-[13px] font-semibold text-on-danger">{formatBRL(expense)}</span>
        </div>
      </div>
    </div>
  );
}
