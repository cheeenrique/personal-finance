import { calendarPartsSP } from "@/lib/date/calendar-sp";
import { reportService } from "@/modules/reports/service";
import { monthBoundsSP, subtractMonths } from "./score";
import type { CategoryTrend, TrendsResult } from "./types";

/**
 * Tendência de gasto por categoria: mês atual vs. média móvel dos `months-1`
 * meses anteriores (docs internos da task). Mesma base accrual de
 * `reportService.categoryTotals` (agrupa por `date`, não por caixa) — é a
 * mesma leitura já usada pelos budgets/relatório "Por categoria", consistente
 * com o que o usuário já vê em `/reports`.
 */

/** Abaixo deste valor, uma categoria não é sinalizada como "subindo" mesmo com `deltaPct` alto — evita ruído de gasto trivial (ex.: R$5 → R$15 é +200% mas irrelevante). */
const RISING_FLOOR = 20;
const RISING_DELTA_PCT = 20;

/** `avgPrevious<=0` (categoria nova, sem histórico) não permite razão — trata como alta máxima sinalizável, sem inventar um percentual literal (evita `Infinity` não-serializável). */
function computeDeltaPct(current: number, avgPrevious: number): number {
  if (avgPrevious <= 0) return current > 0 ? 100 : 0;
  return ((current - avgPrevious) / avgPrevious) * 100;
}

async function sumCategoryTotalsForMonth(
  userId: string,
  year: number,
  month: number,
): Promise<Map<string, { name: string; total: number }>> {
  const { start, end } = monthBoundsSP(year, month);
  const rows = await reportService.categoryTotals(userId, start, end);

  const byCategory = new Map<string, { name: string; total: number }>();
  for (const row of rows) {
    byCategory.set(row.categoryId, { name: row.categoryName, total: row.total.toNumber() });
  }
  return byCategory;
}

export async function categoryTrends(userId: string, refDate: Date = new Date(), months = 4): Promise<TrendsResult> {
  const { year, month } = calendarPartsSP(refDate);
  const priorCount = Math.max(months - 1, 1);

  const priorMonths = Array.from({ length: priorCount }, (_, index) => subtractMonths(year, month, index + 1));

  const [current, ...priorMaps] = await Promise.all([
    sumCategoryTotalsForMonth(userId, year, month),
    ...priorMonths.map((ym) => sumCategoryTotalsForMonth(userId, ym.year, ym.month)),
  ]);

  const priorTotalsByCategory = new Map<string, number>();
  for (const priorMap of priorMaps) {
    for (const [categoryId, entry] of priorMap) {
      priorTotalsByCategory.set(categoryId, (priorTotalsByCategory.get(categoryId) ?? 0) + entry.total);
    }
  }

  const trends: CategoryTrend[] = [];
  for (const [categoryId, entry] of current) {
    const avgPrevious = (priorTotalsByCategory.get(categoryId) ?? 0) / priorCount;
    const deltaPct = computeDeltaPct(entry.total, avgPrevious);
    const rising = entry.total > RISING_FLOOR && deltaPct > RISING_DELTA_PCT;

    trends.push({ categoryId, categoryName: entry.name, current: entry.total, avgPrevious, deltaPct, rising });
  }

  const rising = trends.filter((trend) => trend.rising).sort((a, b) => b.deltaPct - a.deltaPct);

  return { rising, window: months };
}
