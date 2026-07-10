"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { periodToRange } from "@/components/transactions/period-presets";

/**
 * Opções do filtro de período do detalhe de conta (docs/21-ACCOUNTS.md,
 * "Filtros"; handoff "Conta (Detalhe)", faixa 1 dos filtros ricos) — 4 modos
 * visíveis no segmented control + "all" (default silencioso, ver
 * `useAccountPeriodFilter` abaixo).
 */
export type AccountPeriodMode = "all" | "this_month" | "last_month" | "last_3_months" | "custom";

/** Só os 4 modos do segmented control (handoff) — "all" não é uma pill clicável, ver default do hook. */
export const ACCOUNT_PERIOD_MODE_OPTIONS: { value: AccountPeriodMode; label: string }[] = [
  { value: "this_month", label: "Mês atual" },
  { value: "last_month", label: "Mês passado" },
  { value: "last_3_months", label: "3 meses" },
  { value: "custom", label: "Personalizado" },
];

type CalendarDate = { year: number; month: number; day: number };

/** Mesma aritmética de calendário de `components/transactions/period-presets.ts` (2ª ocorrência, rule 02-dry-kiss-yagni: só na 3ª extrai pro preset compartilhado). */
function todaySaoPaulo(): CalendarDate {
  const [year, month, day] = toDateInputValueSaoPaulo().split("-").map(Number);
  return { year, month, day };
}

function toDateStr({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addMonthsCalendar({ year, month, day }: CalendarDate, delta: number): CalendarDate {
  const anchor = new Date(Date.UTC(year, month - 1 + delta, day));
  return { year: anchor.getUTCFullYear(), month: anchor.getUTCMonth() + 1, day: anchor.getUTCDate() };
}

/** Últimos 3 meses corridos (mês atual + 2 anteriores) — período próprio desta tela, sem promover pro preset compartilhado (sem 3º consumidor ainda). */
function lastThreeMonthsRange(): { dateFrom: string; dateTo: string } {
  const today = todaySaoPaulo();
  const start = addMonthsCalendar(today, -2);
  return {
    dateFrom: toDateStr({ ...start, day: 1 }),
    dateTo: toDateStr({ ...today, day: lastDayOfMonth(today.year, today.month) }),
  };
}

/**
 * Resolve o range de data de cada modo — extraído do hook pra reuso (rótulos
 * do resumo de fluxo, `accountPeriodFullLabel`/`accountPeriodShortLabel`
 * abaixo) e teste isolado. "custom" usa `customFrom`/`customTo` livres; os
 * demais reaproveitam `periodToRange` (mesmo cálculo de "Mês atual"/"Mês
 * passado" de `/transactions`), exceto "last_3_months" (só desta tela).
 */
export function resolveRange(
  mode: AccountPeriodMode,
  customFrom: string,
  customTo: string,
): { dateFrom?: string; dateTo?: string } {
  if (mode === "custom") return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
  if (mode === "last_3_months") return lastThreeMonthsRange();
  return periodToRange(mode);
}

function monthYearAt(offsetMonths: number): string {
  const today = todaySaoPaulo();
  const target = addMonthsCalendar(today, offsetMonths);
  return format(new Date(target.year, target.month - 1, 1), "MMM/yyyy", { locale: ptBR });
}

/** Rótulo curto pro cabeçalho dos KPIs "Entradas · X"/"Saídas · X" (handoff, `statLabel`). */
export function accountPeriodShortLabel(mode: AccountPeriodMode): string {
  switch (mode) {
    case "this_month":
      return monthYearAt(0).split("/")[0];
    case "last_month":
      return monthYearAt(-1).split("/")[0];
    case "last_3_months":
      return "3 meses";
    case "custom":
      return "período";
    default:
      return "todos";
  }
}

/** Rótulo completo pro card "Fluxo do período" + chip de período ativo (handoff, `periodNames`). */
export function accountPeriodFullLabel(mode: AccountPeriodMode): string {
  switch (mode) {
    case "this_month":
      return `Mês atual (${monthYearAt(0)})`;
    case "last_month":
      return `Mês passado (${monthYearAt(-1)})`;
    case "last_3_months":
      return "Últimos 3 meses";
    case "custom":
      return "Período personalizado";
    default:
      return "Todos os períodos";
  }
}

/**
 * Filtro de período do histórico de transações da conta. Estado local (não
 * persiste na URL) — escopo menor que `useTransactionFilters`, sem os demais
 * filtros de `/transactions` (docs/06-SCREENS.md, "Contas").
 */
export function useAccountPeriodFilter() {
  // Default "all": importação de OFX traz lançamentos de meses passados — com
  // "Mês atual" eles somem da tabela (mas contam no saldo/gráfico), o que
  // confunde ("importei e não apareceu"). "Todos" mostra tudo (paginado), sem
  // aparecer como pill ativa no segmented control (handoff só define 4
  // opções) — nenhuma pill fica destacada até o usuário escolher uma.
  const [mode, setMode] = useState<AccountPeriodMode>("all");
  const [customFrom, setCustomFrom] = useState(() => toDateInputValueSaoPaulo());
  const [customTo, setCustomTo] = useState(() => toDateInputValueSaoPaulo());

  const range = useMemo(() => resolveRange(mode, customFrom, customTo), [mode, customFrom, customTo]);

  return { mode, setMode, customFrom, setCustomFrom, customTo, setCustomTo, range };
}
