import { toZonedTime } from "date-fns-tz";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";

/**
 * Janela de tempo [gte, lt) em UTC — limite superior exclusivo, mesma
 * convenção de `modules/transactions/service.ts` `monthWindowUtc` (evita
 * duplicar/omitir o instante exato de virada).
 */
export type WeekWindow = { gte: Date; lt: Date };

type CalendarParts = { year: number; month: number; day: number };

/**
 * Aritmética de calendário em America/Sao_Paulo — duplicada (não importada)
 * de `modules/recurring/next-run.ts` por instrução explícita da task: helpers
 * locais ao módulo, sem extrair para `lib/` compartilhada (extração DRY fica
 * para depois, ver sugestão de melhoria no retorno da task).
 */
function calendarPartsSP(date: Date): CalendarParts {
  const zoned = toZonedTime(date, TIMEZONE);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

/** Dia da semana (0=domingo..6=sábado) no calendário America/Sao_Paulo. */
function weekdaySP(date: Date): number {
  return toZonedTime(date, TIMEZONE).getDay();
}

/** Último dia do mês (1-based), usado pelo fechamento de mês (ver `weekEndsMonth`, alerta de orçamento em green.ts). */
function daysInMonthSP(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Soma/subtrai dias de calendário (America/Sao_Paulo) via aritmética sobre os
 * campos ano/mês/dia — `Date.setDate` do JS resolve corretamente o rollover
 * de mês/ano, sem assumir dia = 24h em ms (mesmo racional de
 * `modules/recurring/next-run.ts` `nextDayStartSP`).
 */
function addCalendarDaysSP(date: Date, days: number): Date {
  const { year, month, day } = calendarPartsSP(date);
  const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
  localMidnight.setDate(localMidnight.getDate() + days);
  return parseInSaoPaulo(localMidnight);
}

/**
 * Início (00:00 SP) da semana corrente de `refDate` — domingo mais recente
 * na data-calendário de `refDate` (America/Sao_Paulo), incluindo o próprio
 * `refDate` quando ele já é domingo.
 */
function startOfWeekSP(refDate: Date): Date {
  const { year, month, day } = calendarPartsSP(refDate);
  const localMidnight = new Date(year, month - 1, day, 0, 0, 0, 0);
  localMidnight.setDate(localMidnight.getDate() - weekdaySP(refDate));
  return parseInSaoPaulo(localMidnight);
}

/**
 * Janela [domingo 00:00, sábado 23:59:59.999] (America/Sao_Paulo) da semana
 * que ACABOU DE FECHAR relativa a `refDate` (docs/29-ALERTS.md, "Janela de
 * Tempo"). O cron roda domingo de manhã — `refDate` = agora (domingo) ⇒
 * janela = do domingo anterior ao sábado anterior (a semana que passou).
 * Implementado como [gte, lt): `lt` é o início da semana corrente de
 * `refDate`, então a janela nunca inclui a semana em andamento.
 */
export function getClosedWeekWindow(refDate: Date): WeekWindow {
  const currentWeekStart = startOfWeekSP(refDate);
  const targetWeekStart = addCalendarDaysSP(currentWeekStart, -7);
  return { gte: targetWeekStart, lt: currentWeekStart };
}

/**
 * As `count` janelas semanais imediatamente ANTERIORES a `weekStart`
 * (exclusive) — baseline de 8 semanas do algoritmo de anomalia/verde
 * (docs/29-ALERTS.md, "Baseline": "exclui a semana atual do cálculo").
 * `weekStart` é sempre o `.gte` da semana-alvo (ver `getClosedWeekWindow`).
 */
export function getPrecedingWeekWindows(weekStart: Date, count: number): WeekWindow[] {
  const windows: WeekWindow[] = [];
  let cursor = weekStart;

  for (let i = 0; i < count; i += 1) {
    const start = addCalendarDaysSP(cursor, -7);
    windows.push({ gte: start, lt: cursor });
    cursor = start;
  }

  return windows;
}

/** Chave estável de dedup/idempotência — data-calendário (SP) do início da semana, ex. "2026-06-29". */
export function weekKeyFor(window: WeekWindow): string {
  const { year, month, day } = calendarPartsSP(window.gte);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Data-calendário (SP) do último dia da janela (sábado), formatada `yyyy-MM-dd` — usada no payload do resumo semanal. */
export function weekEndDateKey(window: WeekWindow): string {
  const lastInstant = addCalendarDaysSP(window.lt, -1);
  const { year, month, day } = calendarPartsSP(lastInstant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * `{ year, month }` quando o último dia da janela semanal (sábado) é o
 * último dia calendário do mês (America/Sao_Paulo); `null` caso contrário.
 * Usado pelo alerta verde de orçamento (green.ts): "mês fechou abaixo do
 * orçamento" só é avaliado na semana em que o mês efetivamente termina
 * (docs/29-ALERTS.md, "Alerta Verde", condição b).
 */
export function weekEndsMonth(window: WeekWindow): { year: number; month: number } | null {
  const lastInstant = addCalendarDaysSP(window.lt, -1);
  const { year, month, day } = calendarPartsSP(lastInstant);
  return day === daysInMonthSP(year, month) ? { year, month } : null;
}

/**
 * Janela [gte, lt) do mês (America/Sao_Paulo) — mesma construção de
 * `modules/transactions/service.ts` `monthWindowUtc`, duplicada localmente
 * (ver nota de escopo no topo do arquivo: sem extração pra lib compartilhada
 * nesta task). Usada só pelo alerta de orçamento em green.ts.
 */
export function monthWindow(year: number, month: number): WeekWindow {
  const startOfMonthLocal = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const startOfNextMonthLocal =
    month === 12 ? new Date(year + 1, 0, 1, 0, 0, 0, 0) : new Date(year, month, 1, 0, 0, 0, 0);

  return { gte: parseInSaoPaulo(startOfMonthLocal), lt: parseInSaoPaulo(startOfNextMonthLocal) };
}
