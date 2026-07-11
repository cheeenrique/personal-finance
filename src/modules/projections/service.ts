import { Prisma } from "@/generated/prisma/client";
import { accountService } from "@/modules/accounts/service";
import { calendarPartsSP, daysInMonthSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { projectionRepository, type DateRange } from "./repository";
import { projectRecurringOccurrences, type ProjectedMovement } from "./recurrence-projection";
import { InvalidHorizonError } from "./errors";
import type { CashflowProjection, ProjectionPoint } from "./types";

/**
 * BASE da projeção: só movimentos que afetam a CONTA diretamente (cash
 * base), mesmo recorte de `reportRepository.buildCashflowConditions`
 * (`modules/reports/repository.ts`, insumo de `reportService.cashflowByMonth`):
 * `cardId IS NULL`, `transferId IS NULL`, `deletedAt IS NULL`. Duas fontes:
 *
 *  1. Parcelas de EMPRÉSTIMO ainda não pagas (`Transaction.loanId != null`,
 *     `isPaid: false`) — vencem e debitam a conta na `date` (docs/03-DATABASE.md).
 *     Inclui parcelas ATRASADAS (vencidas antes de hoje, ainda não pagas —
 *     `repository.ts`); `bucketByDay` clampa essas pro dia 0 da janela.
 *  2. Recorrências ATIVAS (`RecurringTransaction`), projetadas dia a dia com
 *     `computeNextRun` (ver `recurrence-projection.ts`). O schema NÃO modela
 *     recorrência de cartão — `RecurringTransaction.accountId` é obrigatório
 *     e não existe `cardId` no model — então TODA recorrência ativa afeta a
 *     conta diretamente, sem filtro extra de destino.
 *
 * Compras PARCELADAS DE CARTÃO (`installmentPurchaseId != null`) NÃO entram
 * aqui de propósito: debitam a FATURA, não a conta — só afetariam o saldo
 * quando a fatura fosse paga (uma Transaction `CARD_PAYMENT` futura, que essa
 * projeção não tenta prever por não ser um movimento já agendado/conhecido).
 */

/** Sequência de `horizonDays` dias corridos (calendário America/Sao_Paulo) a partir do dia de `refDate`, inclusive. */
function buildDayWindow(refDate: Date, horizonDays: number): Date[] {
  const { year, month, day } = calendarPartsSP(refDate);
  let y = year;
  let m = month;
  let d = day;
  const days: Date[] = [];

  for (let i = 0; i < horizonDays; i += 1) {
    days.push(startOfDaySP(y, m, d));

    const lastDay = daysInMonthSP(y, m);
    d += 1;
    if (d > lastDay) {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }

  return days;
}

function toDateRange(days: Date[]): DateRange {
  return { gte: days[0], lte: days[days.length - 1] };
}

/**
 * Soma todos os movimentos assinados por dia (`YYYY-MM-DD` SP) — 1 bucket por
 * dia da janela, mesmo sem movimento nenhum nele. Movimento com data ANTERIOR
 * ao início da janela (obrigação atrasada — parcela de empréstimo vencida ou
 * primeira ocorrência de recorrência com `nextRun` no passado, ver
 * `repository.ts`/`recurrence-projection.ts`) é clampado pro dia 0
 * (`max(data, startDay)`): a dívida é real e reduz o saldo a partir de hoje,
 * não pode sumir da projeção.
 */
function bucketByDay(days: Date[], movements: ProjectedMovement[]): Map<string, Prisma.Decimal> {
  const byDay = new Map<string, Prisma.Decimal>(days.map((day) => [toDateInputValueSaoPaulo(day), new Prisma.Decimal(0)]));
  const startDay = days[0];

  for (const movement of movements) {
    const bucketDate = movement.date.getTime() < startDay.getTime() ? startDay : movement.date;
    const key = toDateInputValueSaoPaulo(bucketDate);
    const current = byDay.get(key);
    if (current === undefined) continue; // fora da janela (data além do fim) — guarda extra além do filtro de range já aplicado nas fontes.
    byDay.set(key, current.plus(movement.signedAmount));
  }

  return byDay;
}

/** Parcela de empréstimo sempre DEBITA a conta — não existe INCOME associado a `loanId` (docs/03-DATABASE.md). */
function signedLoanAmount(amount: Prisma.Decimal): Prisma.Decimal {
  return amount.negated();
}

/**
 * Projeção de fluxo de caixa (saldo de conta) pra frente, dia a dia, por
 * `horizonDays` dias a partir do dia calendário de `refDate` (America/Sao_Paulo,
 * inclusive — o dia de `refDate` já é o primeiro ponto retornado, aplicando
 * as obrigações que vencem hoje). Saldo inicial = `accountService.totalBalance`
 * (soma de TODAS as contas ativas, já reflete tudo que foi pago até agora).
 *
 * `refDate` default = instante REAL (`new Date()`), nunca convertido antes —
 * mesma cautela documentada em `accountService.getInsufficientBalanceReport`:
 * `calendarPartsSP` já faz a conversão pra calendário SP, converter duas
 * vezes deslocaria o corte de dia na madrugada.
 */
async function forecast(userId: string, horizonDays: number, refDate: Date = new Date()): Promise<CashflowProjection> {
  if (!Number.isInteger(horizonDays) || horizonDays <= 0) {
    throw new InvalidHorizonError(horizonDays);
  }

  const days = buildDayWindow(refDate, horizonDays);
  const range = toDateRange(days);

  const [startingBalance, loanInstallments, recurringTemplates] = await Promise.all([
    accountService.totalBalance(userId),
    projectionRepository.listUnpaidLoanInstallments(userId, range),
    projectionRepository.listActiveRecurringTransactions(userId),
  ]);

  const movements: ProjectedMovement[] = [
    ...loanInstallments.map((installment) => ({
      date: installment.date,
      signedAmount: signedLoanAmount(installment.amount),
    })),
    ...recurringTemplates.flatMap((template) => projectRecurringOccurrences(template, range.gte, range.lte)),
  ];

  const byDay = bucketByDay(days, movements);

  let running = startingBalance;
  let lowestBalance = startingBalance;
  let firstNegativeDate: string | null = null;
  const points: ProjectionPoint[] = [];

  for (const day of days) {
    const key = toDateInputValueSaoPaulo(day);
    running = running.plus(byDay.get(key) ?? new Prisma.Decimal(0));

    if (running.lessThan(lowestBalance)) lowestBalance = running;
    if (firstNegativeDate === null && running.lessThan(0)) firstNegativeDate = key;

    points.push({ date: key, balance: running.toNumber() });
  }

  return {
    points,
    firstNegativeDate,
    lowestBalance: lowestBalance.toNumber(),
    horizonDays,
  };
}

export const projectionService = { forecast };
