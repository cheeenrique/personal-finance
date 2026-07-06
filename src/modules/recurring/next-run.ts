import { toZonedTime } from "date-fns-tz";
import { RecurringFrequency } from "@/generated/prisma/enums";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";
import type { RecurringSchedule } from "./types";

type CalendarParts = { year: number; month: number; day: number };

/** Ano/mês/dia (1-based) do calendário America/Sao_Paulo para um instante. */
function calendarPartsSP(date: Date): CalendarParts {
  const zoned = toZonedTime(date, TIMEZONE);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

/** Dia da semana (0=domingo .. 6=sábado) no calendário America/Sao_Paulo. */
function weekdaySP(date: Date): number {
  return toZonedTime(date, TIMEZONE).getDay();
}

/** Último dia do mês (1-based) — usado pra clampar `dayOfMonth` em meses curtos (ex.: 31 em fevereiro). */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Meia-noite (America/Sao_Paulo) de um dia calendário, convertida pro
 * instante UTC correto — mesma construção via getters locais usada em
 * `modules/transactions/service.ts` `monthWindowUtc`.
 */
function startOfDaySP(year: number, month: number, day: number): Date {
  return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Dia seguinte (America/Sao_Paulo) ao instante recebido, à meia-noite.
 * Implementado via aritmética de calendário (não `+24h` em ms) pra não
 * depender de nenhuma suposição sobre duração do dia — Brasil não observa
 * horário de verão desde 2019, mas evitamos a suposição mesmo assim.
 */
function nextDayStartSP(date: Date): Date {
  const { year, month, day } = calendarPartsSP(date);
  const lastDay = daysInMonth(year, month);

  if (day < lastDay) return startOfDaySP(year, month, day + 1);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return startOfDaySP(nextYear, nextMonth, 1);
}

function computeNextMonthly(dayOfMonth: number, from: Date): Date {
  let { year, month } = calendarPartsSP(from);
  let candidate = startOfDaySP(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));

  while (candidate.getTime() <= from.getTime()) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    candidate = startOfDaySP(year, month, Math.min(dayOfMonth, daysInMonth(year, month)));
  }

  return candidate;
}

function computeNextWeekly(dayOfWeek: number, from: Date): Date {
  const { year, month, day } = calendarPartsSP(from);
  let candidate = startOfDaySP(year, month, day);

  do {
    candidate = nextDayStartSP(candidate);
  } while (weekdaySP(candidate) !== dayOfWeek);

  return candidate;
}

/**
 * Calcula o próximo disparo de um template, estritamente APÓS `from`, em
 * America/Sao_Paulo (docs/20-TRANSACTIONS.md, "Recorrência"). Usado tanto na
 * criação do template (`from` = agora) quanto ao avançar `nextRun` depois de
 * gerar uma Transaction (`from` = o `nextRun` que acabou de disparar) — ver
 * `run.ts`.
 *
 * MONTHLY: `dayOfMonth` clampado ao último dia do mês quando o mês é mais
 * curto (ex.: dayOfMonth=31 em fevereiro vira o dia 28/29).
 * WEEKLY: próxima ocorrência do `dayOfWeek` (0=domingo..6=sábado), sempre
 * estritamente no futuro.
 */
export function computeNextRun(schedule: RecurringSchedule, from: Date): Date {
  if (schedule.frequency === RecurringFrequency.MONTHLY) {
    return computeNextMonthly(schedule.dayOfMonth as number, from);
  }

  return computeNextWeekly(schedule.dayOfWeek as number, from);
}
