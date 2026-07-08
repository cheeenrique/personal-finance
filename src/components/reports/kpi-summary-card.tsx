import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, DollarSign } from "lucide-react";

import { ChartWrapper } from "@/components/shared/chart-wrapper";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";

type KpiSummaryCardProps = {
  income: number;
  expense: number;
  net: number;
};

/** Tile do ícone (fundo tintado + ícone `on-{tone}`) — mesmo vocabulário de `@/components/shared/kpi-card.tsx` `TONE_CLASSES`. */
const TONE_TILE_CLASSES = {
  success: "bg-success/16 text-on-success",
  danger: "bg-destructive/16 text-on-danger",
} as const;

/** Cor do valor (tile ou texto direto sobre o card) — sempre `on-*`
 * (docs/04-DESIGN_SYSTEM.md, "Tokens": é o único par success/danger que passa
 * AA nos 2 temas como cor de texto; a base `--success`/`--destructive` é
 * pastel demais no tema claro — ~2.2:1 sobre `--card`, ver "LA1"). Mesmo
 * padrão de `dashboard/weekly-summary-box.tsx` `SummaryRow`. */
const TONE_VALUE_CLASSES = {
  success: "text-on-success",
  danger: "text-on-danger",
} as const;

/**
 * "Resumo do período" — os 3 KPIs (Receitas/Despesas/Saldo) que antes viviam
 * dentro de `CashflowSection` (docs/28-REPORTS.md, "Relatório de Fluxo de
 * Caixa"), extraídos pra card próprio pra rebalancear a linha 1 de
 * `/reports` (3 colunas de peso parecido em vez de 1 bloco carregando os
 * KPIs + o gráfico). `ChartWrapper` só pela borda/fundo iguais aos gráficos
 * vizinhos — não há gráfico aqui dentro.
 *
 * Ícones seta pra cima/baixo (Receitas/Despesas) + cifrão (Saldo, docs/04-
 * DESIGN_SYSTEM.md "Tokens": nenhuma cor fora de success/destructive/muted).
 * Saldo ganha destaque próprio (tile maior + label "sobrou"/"faltou") em vez
 * de ser só a 3ª linha igual às outras — é o número que resume o período.
 */
export function KpiSummaryCard({ income, expense, net }: KpiSummaryCardProps) {
  const netTone: keyof typeof TONE_TILE_CLASSES = net >= 0 ? "success" : "danger";
  const netLabel = net >= 0 ? "Sobrou" : "Faltou";

  return (
    <ChartWrapper title="Resumo do período" height={280}>
      <div className="flex h-full flex-col justify-center gap-3">
        <SummaryStat icon={ArrowUp} label="Receitas (período)" value={income} tone="success" />
        <SummaryStat icon={ArrowDown} label="Despesas (período)" value={expense} tone="danger" />

        <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/40 px-3.5 py-3">
          <span className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-[34px] shrink-0 items-center justify-center rounded-[10px]",
                TONE_TILE_CLASSES[netTone],
              )}
            >
              <DollarSign className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col">
              <span className="text-[11px] font-bold text-muted-foreground uppercase">Saldo</span>
              <span className={cn("text-[11px] font-bold", TONE_VALUE_CLASSES[netTone])}>{netLabel} no período</span>
            </span>
          </span>
          <span className={cn("font-mono text-[19px] font-semibold", TONE_VALUE_CLASSES[netTone])}>
            {formatBRL(Math.abs(net))}
          </span>
        </div>
      </div>
    </ChartWrapper>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: "success" | "danger";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-[30px] shrink-0 items-center justify-center rounded-[9px]",
            TONE_TILE_CLASSES[tone],
          )}
        >
          <Icon className="size-[15px]" aria-hidden="true" strokeWidth={2.4} />
        </span>
        <span className="text-[12px] font-bold text-muted-foreground">{label}</span>
      </span>
      <span className={cn("font-mono text-[15px] font-semibold", TONE_VALUE_CLASSES[tone])}>{formatBRL(value)}</span>
    </div>
  );
}
