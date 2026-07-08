import { CalendarDays, TrendingDown, TrendingUp } from "lucide-react";

import type { WeeklySummaryPayload } from "@/modules/alerts/weekly-summary";
import { formatBRL } from "@/lib/money/format";
import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";

const CATEGORY_DOT_COLORS = ["bg-primary", "bg-accent", "bg-warning", "bg-transfer", "bg-asset"];

/** "2026-06-30" (chave de calendário SP) → "30/06" — reformatação de string, sem passar por `Date` (evita risco de virar o dia). */
function formatDayMonth(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${day}/${month}`;
}

type WeeklySummaryBoxProps = {
  summary: WeeklySummaryPayload;
};

/**
 * Box "Resumo Semanal" — só leitura do payload já gerado pelo cron
 * (docs/11-DASHBOARD.md, docs/29-ALERTS.md "WEEKLY_SUMMARY"). Visibilidade
 * (janela dom 00h → seg 14h) é decidida ANTES, no Server Component da página
 * (`alertService.getWeeklySummaryForDashboard`) — este componente só
 * renderiza o que recebe.
 */
export function WeeklySummaryBox({ summary }: WeeklySummaryBoxProps) {
  const income = Number(summary.income);
  const expense = Number(summary.expense);
  const balance = Number(summary.balance);

  return (
    <div className={cn("rounded-xl border border-border bg-card", CARD_SHADOW_CLASS)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-[18px] py-[15px]">
        <h3 className="flex items-center gap-2 text-sm font-extrabold text-foreground">
          <CalendarDays className="size-4 text-primary" aria-hidden="true" />
          Resumo da semana
        </h3>
        <span className="font-mono text-[12.5px] font-semibold text-muted-foreground">
          {formatDayMonth(summary.weekStart)} a {formatDayMonth(summary.weekEnd)}
        </span>
      </div>

      <div className="grid gap-4 p-[18px] sm:grid-cols-2">
        <div className="space-y-3">
          <SummaryRow label="Receitas" value={income} tone="success" />
          <SummaryRow
            label="Despesas"
            value={expense}
            tone="danger"
            deltaPercent={summary.deltaExpensePercent}
          />
          <SummaryRow label="Saldo" value={balance} tone={balance >= 0 ? "success" : "danger"} signed />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase">
            Top categorias da semana
          </p>
          {summary.topCategories.length === 0 ? (
            <p className="text-[13px] font-medium text-muted-foreground">Nenhum gasto por categoria nesta semana.</p>
          ) : (
            <ul className="space-y-2">
              {summary.topCategories.map((category, index) => {
                const percent = expense > 0 ? (Number(category.total) / expense) * 100 : 0;
                return (
                  <li key={category.categoryId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[12.5px] font-semibold">
                      <span className="flex items-center gap-1.5 truncate">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            CATEGORY_DOT_COLORS[index % CATEGORY_DOT_COLORS.length],
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{category.categoryName}</span>
                      </span>
                      <span className="font-mono whitespace-nowrap text-muted-foreground">
                        {formatBRL(category.total)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={cn("h-full rounded-full", CATEGORY_DOT_COLORS[index % CATEGORY_DOT_COLORS.length])}
                        style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  tone,
  deltaPercent,
  signed = false,
}: {
  label: string;
  value: number;
  tone: "success" | "danger";
  deltaPercent?: number | null;
  signed?: boolean;
}) {
  /** `on-*` — mesma regra de `reports/kpi-summary-card.tsx` `TONE_VALUE_CLASSES`
   * (docs/04-DESIGN_SYSTEM.md, "Tokens": base `--success`/`--destructive` como
   * cor de texto direto falha AA no tema claro, ~2.2:1 sobre `--card`). */
  const toneClass = tone === "success" ? "text-on-success" : "text-on-danger";
  const prefix = signed && value > 0 ? "+ " : "";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[13px] font-bold text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={cn("font-mono text-[15px] font-semibold", toneClass)}>
          {prefix}
          {formatBRL(value)}
        </span>
        {deltaPercent !== null && deltaPercent !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold",
              deltaPercent <= 0 ? "text-on-success" : "text-on-danger",
            )}
          >
            {deltaPercent <= 0 ? (
              <TrendingDown className="size-3" aria-hidden="true" />
            ) : (
              <TrendingUp className="size-3" aria-hidden="true" />
            )}
            {Math.abs(deltaPercent)}% vs. semana anterior
          </span>
        )}
      </div>
    </div>
  );
}
