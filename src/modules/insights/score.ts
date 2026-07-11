import { Prisma } from "@/generated/prisma/client";
import { AssetType, CardType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { calendarPartsSP, daysInMonthSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { reportService } from "@/modules/reports/service";
import { cardService } from "@/modules/cards/service";
import type { HealthScore, ScoreBreakdown, ScoreTone } from "./types";

/**
 * Score de saúde financeira (0-100) a partir de 3 métricas independentes:
 * taxa de poupança (docs internos da task), comprometimento com dívida e
 * meses de reserva de emergência. Cada métrica vira uma nota 0-100
 * (`linearScore`) e o score final é a média ponderada (0.4/0.3/0.3).
 */

/** Início/fim (meia-noite SP) do mês calendário — `reportService.cashflow` estende `dateTo` até o fim do dia internamente (`endOfDayInclusive`), então basta passar a meia-noite do último dia. */
export function monthBoundsSP(year: number, month: number): { start: Date; end: Date } {
  return { start: startOfDaySP(year, month, 1), end: startOfDaySP(year, month, daysInMonthSP(year, month)) };
}

/** `n` meses antes de `year`/`month` (1-12), com rollover de ano — usado pra montar janelas de meses anteriores (score, trends, narrative). */
export function subtractMonths(year: number, month: number, n: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) - n;
  return { year: Math.floor(zeroBased / 12), month: ((zeroBased % 12) + 12) % 12 + 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Mapeia um valor bruto pra nota 0-100, linear entre `worst` (→0) e `best`
 * (→100) — funciona tanto pra métricas "maior é melhor" (`best > worst`,
 * taxa de poupança/cushion) quanto "menor é melhor" (`best < worst`, dívida):
 * a razão `(value-worst)/(best-worst)` já inverte o sinal sozinha.
 */
function linearScore(value: number, worst: number, best: number): number {
  const ratio = (value - worst) / (best - worst);
  return clamp(ratio * 100, 0, 100);
}

function toneFromScore(score: number): ScoreTone {
  if (score >= 70) return "success";
  if (score >= 40) return "warning";
  return "danger";
}

/** Σ Transaction de parcela de empréstimo/financiamento (`loanId` não-nulo) no mês — docs internos, "Comprometimento com dívida". */
async function loanInstallmentsTotal(userId: string, range: { start: Date; end: Date }, nextMonthStart: Date): Promise<Prisma.Decimal> {
  const result = await prisma.transaction.aggregate({
    where: { userId, loanId: { not: null }, deletedAt: null, date: { gte: range.start, lt: nextMonthStart } },
    _sum: { amount: true },
  });
  return result._sum.amount ?? new Prisma.Decimal(0);
}

/** Σ fatura atual dos cartões CREDIT (docs `modules/cards/service.ts` `listWithSummary`) — MEAL não tem fatura, excluído. */
async function currentCardInvoicesTotal(userId: string): Promise<Prisma.Decimal> {
  const cards = await cardService.listWithSummary(userId);
  return cards
    .filter((card) => card.type === CardType.CREDIT)
    .reduce((total, card) => total.plus(card.currentInvoiceTotal), new Prisma.Decimal(0));
}

/** Σ `Asset.currentValue` dos tipos EMERGENCY_FUND + INVESTMENT — reserva de emergência e investimentos (reserva líquida), docs/03-DATABASE.md `Asset`. */
async function liquidReserveTotal(userId: string): Promise<Prisma.Decimal> {
  const result = await prisma.asset.aggregate({
    where: { userId, type: { in: [AssetType.EMERGENCY_FUND, AssetType.INVESTMENT] }, deletedAt: null },
    _sum: { currentValue: true },
  });
  return result._sum.currentValue ?? new Prisma.Decimal(0);
}

function buildBreakdown(key: ScoreBreakdown["key"], label: string, value: number, score: number): ScoreBreakdown {
  return { key, label, value, score, tone: toneFromScore(score) };
}

/**
 * `refDate` default = instante real (`new Date()`), convertido pro calendário
 * SP só na leitura de ano/mês/dia (mesmo racional de `cardService.currentInvoice`).
 */
export async function healthScore(userId: string, refDate: Date = new Date()): Promise<HealthScore> {
  const { year, month } = calendarPartsSP(refDate);
  const { start: monthStart, end: monthEnd } = monthBoundsSP(year, month);
  // Mesmo padrão de `modules/transactions/service.ts` `monthWindowUtc` — limite exclusivo (`lt`) do mês seguinte, evita depender de "fim do dia" pra uma query fora do `reportService` (que já resolve isso internamente).
  const nextMonthStart = month === 12 ? startOfDaySP(year + 1, 1, 1) : startOfDaySP(year, month + 1, 1);

  const priorMonths = [1, 2].map((n) => subtractMonths(year, month, n));

  const [monthCashflow, priorCashflows, loanTotal, cardInvoiceTotal, liquidReserve] = await Promise.all([
    reportService.cashflow(userId, monthStart, monthEnd),
    Promise.all(
      priorMonths.map(({ year: priorYear, month: priorMonth }) => {
        const bounds = monthBoundsSP(priorYear, priorMonth);
        return reportService.cashflow(userId, bounds.start, bounds.end);
      }),
    ),
    loanInstallmentsTotal(userId, { start: monthStart, end: monthEnd }, nextMonthStart),
    currentCardInvoicesTotal(userId),
    liquidReserveTotal(userId),
  ]);

  const income = monthCashflow.income;
  const debtTotal = loanTotal.plus(cardInvoiceTotal);

  // Meses com QUALQUER despesa nos últimos 3 — divide só pelos meses com
  // atividade real (mínimo 1), não sempre por 3: usuário novo (1 mês de
  // histórico) não pode ter a média diluída e a reserva de emergência
  // inflada artificialmente.
  const threeMonthExpenses = [monthCashflow, ...priorCashflows].map((cashflow) => cashflow.expense);
  const activeExpenseMonths = Math.max(threeMonthExpenses.filter((expense) => expense.greaterThan(0)).length, 1);
  const totalThreeMonthExpense = threeMonthExpenses.reduce((sum, expense) => sum.plus(expense), new Prisma.Decimal(0));
  const avgMonthlyExpense = totalThreeMonthExpense.dividedBy(activeExpenseMonths);

  const savingsRate = income.isZero() ? (monthCashflow.net.isNegative() ? -1 : 0) : monthCashflow.net.dividedBy(income).toNumber();
  const debtBurden = income.isZero() ? (debtTotal.greaterThan(0) ? 1 : 0) : debtTotal.dividedBy(income).toNumber();
  const cushionMonths = avgMonthlyExpense.isZero()
    ? liquidReserve.greaterThan(0)
      ? 6
      : 0
    : liquidReserve.dividedBy(avgMonthlyExpense).toNumber();

  const savingsScore = linearScore(savingsRate, 0, 0.2);
  const debtScore = linearScore(debtBurden, 0.5, 0.1);
  const cushionScore = linearScore(cushionMonths, 0, 6);

  const breakdown: ScoreBreakdown[] = [
    buildBreakdown("savings", "Taxa de poupança", Number((savingsRate * 100).toFixed(1)), Math.round(savingsScore)),
    buildBreakdown("debt", "Comprometimento com dívida", Number((debtBurden * 100).toFixed(1)), Math.round(debtScore)),
    buildBreakdown("cushion", "Meses de reserva", Number(cushionMonths.toFixed(1)), Math.round(cushionScore)),
  ];

  const score = Math.round(savingsScore * 0.4 + debtScore * 0.3 + cushionScore * 0.3);

  return { score, tone: toneFromScore(score), breakdown };
}
