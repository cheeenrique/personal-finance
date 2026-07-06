import { addMonths, lastDayOfMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { parseInSaoPaulo, TIMEZONE } from "@/lib/date/timezone";

/**
 * Funções puras de cálculo de ciclo de fatura (docs/22-CREDIT_CARDS.md,
 * "Lógica de Fatura" + "Como funciona a fatura"). Sem I/O — toda leitura de
 * Transaction fica no repository/service. Isolado num arquivo próprio (não
 * em service.ts) porque é a peça mais delicada do módulo (timezone + virada
 * de mês) e merece ser testável/lida isoladamente.
 */

export type CardCycle = {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
};

/**
 * Clampa o dia informado (`closingDay`/`dueDay`, 1-31) ao último dia real do
 * mês/ano — evita que "31 de fevereiro" role para março (docs/22: dias 1-31
 * nem sempre existem no mês).
 */
function clampDayToMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = lastDayOfMonth(new Date(year, monthIndex, 1)).getDate();
  return Math.min(day, lastDay);
}

/**
 * Meia-noite de America/Sao_Paulo do dia informado, já convertida para o
 * instante UTC correspondente (docs/22: "todo cálculo de ciclo/fatura usa
 * esses dias interpretados em America/Sao_Paulo — nunca UTC puro").
 */
function saoPauloMidnight(year: number, monthIndex: number, day: number): Date {
  const clampedDay = clampDayToMonth(year, monthIndex, day);
  return parseInSaoPaulo(new Date(year, monthIndex, clampedDay, 0, 0, 0, 0));
}

function closingDateAt(year: number, monthIndex: number, closingDay: number): Date {
  return saoPauloMidnight(year, monthIndex, closingDay);
}

/**
 * Vencimento da fatura cujo fechamento é `periodEnd` (ano/mês informados).
 * docs/22-CREDIT_CARDS.md não define explicitamente a defasagem entre
 * `closingDay` e `dueDay` — assumido o padrão de mercado (nenhuma ambiguidade
 * a mais que já não exista no doc-fonte): se `dueDay > closingDay`, o
 * vencimento cai no MESMO mês do fechamento (ex.: fecha dia 10, vence dia 17,
 * mesma quinzena); caso contrário (`dueDay <= closingDay`), o vencimento cai
 * no mês SEGUINTE ao fechamento (ex.: fecha dia 25, vence dia 5 do mês
 * seguinte).
 */
function dueDateForClosing(
  periodEndYear: number,
  periodEndMonthIndex: number,
  closingDay: number,
  dueDay: number,
): Date {
  if (dueDay > closingDay) {
    return saoPauloMidnight(periodEndYear, periodEndMonthIndex, dueDay);
  }

  const nextMonth = addMonths(new Date(periodEndYear, periodEndMonthIndex, 1), 1);
  return saoPauloMidnight(nextMonth.getFullYear(), nextMonth.getMonth(), dueDay);
}

/**
 * Ciclo (fatura aberta) que contém `refDate` (docs/22-CREDIT_CARDS.md, "Como
 * funciona a fatura"): uma compra pertence ao ciclo quando
 * `data >= fechamento anterior && data < fechamento atual`. Consequência
 * direta dessa regra: uma compra feita NO PRÓPRIO dia de fechamento já
 * pertence ao PRÓXIMO ciclo (o fechamento é tratado como o instante de
 * meia-noite SP daquele dia — a comparação `< fechamento atual` já exclui o
 * próprio dia).
 */
export function cycleContaining(closingDay: number, dueDay: number, refDate: Date): CardCycle {
  const zonedRef = toZonedTime(refDate, TIMEZONE);
  const year = zonedRef.getFullYear();
  const monthIndex = zonedRef.getMonth();

  const thisMonthClosing = closingDateAt(year, monthIndex, closingDay);

  let periodEndYear = year;
  let periodEndMonthIndex = monthIndex;
  let periodEnd = thisMonthClosing;

  if (refDate.getTime() >= thisMonthClosing.getTime()) {
    const nextMonth = addMonths(new Date(year, monthIndex, 1), 1);
    periodEndYear = nextMonth.getFullYear();
    periodEndMonthIndex = nextMonth.getMonth();
    periodEnd = closingDateAt(periodEndYear, periodEndMonthIndex, closingDay);
  }

  const previousMonth = addMonths(new Date(periodEndYear, periodEndMonthIndex, 1), -1);
  const periodStart = closingDateAt(previousMonth.getFullYear(), previousMonth.getMonth(), closingDay);
  const dueDate = dueDateForClosing(periodEndYear, periodEndMonthIndex, closingDay, dueDay);

  return { periodStart, periodEnd, dueDate };
}

/**
 * Ciclo identificado pelo mês/ano em que o FECHAMENTO ocorre (`month` 1-12).
 * Usado por `invoiceFor` para consultar uma fatura específica (passada ou
 * futura), fora do ciclo "aberto" atual.
 */
export function cycleForClosingMonth(
  closingDay: number,
  dueDay: number,
  year: number,
  month: number,
): CardCycle {
  const monthIndex = month - 1;
  const periodEnd = closingDateAt(year, monthIndex, closingDay);
  const previousMonth = addMonths(new Date(year, monthIndex, 1), -1);
  const periodStart = closingDateAt(previousMonth.getFullYear(), previousMonth.getMonth(), closingDay);
  const dueDate = dueDateForClosing(year, monthIndex, closingDay, dueDay);

  return { periodStart, periodEnd, dueDate };
}
