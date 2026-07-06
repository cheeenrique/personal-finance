import { toZonedTime } from "date-fns-tz";
import { TIMEZONE, parseInSaoPaulo } from "./timezone";

/**
 * Primitivas puras de calendário em America/Sao_Paulo, compartilhadas entre
 * `modules/recurring/next-run.ts` e `modules/alerts/week.ts` (eram cópias
 * idênticas nos dois módulos). Só o que é byte-a-byte igual foi extraído —
 * a lógica específica de cada módulo (avanço de `nextRun`, janelas de semana)
 * continua lá, sem reescrita.
 */

export type CalendarPartsSP = { year: number; month: number; day: number };

/** Ano/mês/dia (1-based) do calendário America/Sao_Paulo para um instante. */
export function calendarPartsSP(date: Date): CalendarPartsSP {
  const zoned = toZonedTime(date, TIMEZONE);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

/** Dia da semana (0=domingo..6=sábado) no calendário America/Sao_Paulo. */
export function weekdaySP(date: Date): number {
  return toZonedTime(date, TIMEZONE).getDay();
}

/** Último dia do mês (1-based) — usado pra clampar dias em meses curtos (ex.: 31 em fevereiro). */
export function daysInMonthSP(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Meia-noite (America/Sao_Paulo) de um dia calendário, convertida pro
 * instante UTC correspondente.
 */
export function startOfDaySP(year: number, month: number, day: number): Date {
  return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
}
