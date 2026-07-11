import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Sparkles, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MonthlyNarrative } from "@/modules/insights/types";
import { SectionCard } from "./section-card";
import styles from "./monthly-narrative-card.module.css";

type MonthlyNarrativeCardProps = {
  narrative: MonthlyNarrative;
};

type HighlightTone = "success" | "danger" | "primary" | "warning" | "asset";

/** Mesma receita de tint que `shared/kpi-card.tsx` `TONE_CLASSES` (bg/16 +
 * `text-on-*`) — chaveada por `HighlightTone` em vez de `KPICardProps["tone"]`
 * porque aqui "primary" (Wallet) é uma opção própria, não o "neutral" do KPI. */
const HIGHLIGHT_TILE_CLASSES: Record<HighlightTone, string> = {
  success: "bg-success/16 text-on-success",
  danger: "bg-destructive/16 text-on-danger",
  primary: "bg-primary/18 text-on-primary",
  warning: "bg-warning/16 text-on-warning",
  asset: "bg-asset/16 text-on-asset",
};

/**
 * Heurística leve sobre texto livre pt-BR pra escolher ícone/cor por
 * `destaque` — a IA (`narrative.ts`) devolve string solta, sem enum de
 * categoria. Ordem importa: primeiro padrão que casa vence. Sem match =
 * fallback neutro (dot, comportamento anterior à v2 visual).
 */
const HIGHLIGHT_HEURISTICS: { pattern: RegExp; icon: LucideIcon; tone: HighlightTone }[] = [
  { pattern: /alta|receita|subiu|aumento/i, icon: TrendingUp, tone: "success" },
  { pattern: /gasto|despesa|queda|caiu|↓/i, icon: TrendingDown, tone: "danger" },
  { pattern: /saldo|caixa|reserva/i, icon: Wallet, tone: "primary" },
  { pattern: /vence|fatura|atenção|atencao|atrasado/i, icon: AlertTriangle, tone: "warning" },
  { pattern: /meta|objetivo/i, icon: Target, tone: "asset" },
];

function resolveHighlightIcon(text: string) {
  return HIGHLIGHT_HEURISTICS.find(({ pattern }) => pattern.test(text)) ?? null;
}

/** Tile do ícone + chip "GERADO POR IA" — sinaliza insight automático, mesma
 * linguagem visual do painel de análise de import (`import-analyzing.tsx`). */
function AiHeaderRow() {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-primary/18 text-on-primary">
        <Sparkles className={cn("size-[15px]", styles.sparkle)} aria-hidden="true" />
      </span>
      <span className="inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-[10.5px] font-extrabold tracking-[0.04em] text-muted-foreground uppercase">
        <span className="size-1.5 rounded-full bg-on-primary" aria-hidden="true" />
        Gerado por IA
      </span>
    </div>
  );
}

/**
 * "Resumo do mês" — narrativa factual gerada por IA
 * (`insightsService.monthlyNarrative`), ancorada nos números de caixa do mês
 * corrente. `narrative` é `null` quando a extração falhou (erro-como-dado,
 * ver `modules/insights/narrative.ts`) — nesse caso mostra só um estado vazio
 * discreto, nunca quebra a página.
 */
export function MonthlyNarrativeCard({ narrative }: MonthlyNarrativeCardProps) {
  if (!narrative) {
    return (
      <SectionCard title="Resumo do mês">
        <div className="space-y-3">
          <AiHeaderRow />
          <p className="text-[13px] font-medium text-muted-foreground">Resumo indisponível no momento.</p>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Resumo do mês"
      className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
    >
      <div className="space-y-4">
        <AiHeaderRow />

        <div className={cn("rounded-xl py-4 pr-4 pl-[18px]", styles.narrativeHighlight)}>
          <span className={styles.accentBar} aria-hidden="true" />
          <p className="text-[13.5px] font-semibold leading-[1.6] text-foreground">{narrative.resumo}</p>
        </div>

        {narrative.destaques.length > 0 && (
          <ul className="space-y-2">
            {narrative.destaques.map((destaque, index) => {
              const match = resolveHighlightIcon(destaque);
              const Icon = match?.icon;
              return (
                <li
                  key={index}
                  className={cn(
                    "flex items-center gap-3 rounded-[11px] border border-border bg-secondary px-3.5 py-3",
                    styles.itemIn,
                  )}
                  style={{ animationDelay: `${0.05 + index * 0.1}s` }}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
                      match ? HIGHLIGHT_TILE_CLASSES[match.tone] : "bg-primary/18",
                    )}
                  >
                    {Icon ? (
                      <Icon className="size-[15px]" aria-hidden="true" />
                    ) : (
                      <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                    )}
                  </span>
                  <span className="text-[12.5px] font-semibold text-foreground">{destaque}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}
