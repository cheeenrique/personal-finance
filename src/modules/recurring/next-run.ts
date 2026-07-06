import { RecurringFrequency } from "@/generated/prisma/enums";
import { calendarPartsSP, weekdaySP, daysInMonthSP as daysInMonth, startOfDaySP } from "@/lib/date/calendar-sp";
import type { RecurringSchedule } from "./types";

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
