import { Prisma, type Alert } from "@/generated/prisma/client";
import { AlertType, AlertSeverity } from "@/generated/prisma/enums";
import { transactionRepository } from "@/modules/transactions/repository";
import { settingsService } from "@/modules/settings/service";
import { alertRepository } from "./repository";
import { getClosedWeekWindow, getPrecedingWeekWindows, weekKeyFor, type WeekWindow } from "./week";

/** Baseline de anomalia/verde: média das últimas 8 semanas (docs/29-ALERTS.md, "Baseline"). Exportado — reusado por green.ts. */
export const BASELINE_WEEKS = 8;

type CategoryTotals = Map<string, Prisma.Decimal>;

/** Total de despesas por categoria numa janela — reusa a mesma query de agregação de `modules/transactions` (sem duplicar `groupBy`). */
export async function sumExpensesByCategory(userId: string, window: WeekWindow): Promise<CategoryTotals> {
  const grouped = await transactionRepository.groupExpensesByCategoryInRange(userId, window);
  const totals: CategoryTotals = new Map();

  for (const row of grouped) {
    if (!row.categoryId) continue;
    totals.set(row.categoryId, row.sum);
  }

  return totals;
}

/**
 * Baseline por categoria = média das últimas `BASELINE_WEEKS` semanas
 * (docs/29-ALERTS.md, "Baseline"), excluindo a semana-alvo. Semanas sem
 * gasto numa categoria contam como R$ 0 no denominador (a média é sempre
 * dividida por `BASELINE_WEEKS`, não pelo número de semanas com gasto).
 */
export async function computeCategoryBaseline(userId: string, targetWeekStart: Date): Promise<CategoryTotals> {
  const windows = getPrecedingWeekWindows(targetWeekStart, BASELINE_WEEKS);
  const perWeekTotals = await Promise.all(windows.map((window) => sumExpensesByCategory(userId, window)));

  const sums = new Map<string, Prisma.Decimal>();
  for (const weekTotals of perWeekTotals) {
    for (const [categoryId, amount] of weekTotals) {
      const current = sums.get(categoryId) ?? new Prisma.Decimal(0);
      sums.set(categoryId, current.plus(amount));
    }
  }

  const averages = new Map<string, Prisma.Decimal>();
  for (const [categoryId, sum] of sums) {
    averages.set(categoryId, sum.dividedBy(BASELINE_WEEKS));
  }

  return averages;
}

/** Exportado — reusado por green.ts pro nome de categoria em cada alerta. */
export async function findCategoryName(userId: string, categoryId: string): Promise<string> {
  const names = await transactionRepository.findCategoryNamesByIds([categoryId]);
  return names.get(categoryId) ?? "—";
}

/**
 * Detecta e persiste alertas ANOMALY (docs/29-ALERTS.md, "Anomalia de
 * Gasto"): por categoria, dispara `WARN` quando AMBAS as condições são
 * verdadeiras: `gasto_semana > baseline * alertAnomalyMultiplier` E
 * `gasto_semana > alertMinimumAmount` (thresholds de `UserSettings`).
 *
 * Idempotente por categoria/semana — dedup via `alertRepository.findByDedupKey`
 * (`weekKey` + `categoryId`), então rodar 2x no mesmo `refDate` não duplica.
 */
export async function detectAnomalies(userId: string, refDate: Date): Promise<Alert[]> {
  const window = getClosedWeekWindow(refDate);
  const weekKey = weekKeyFor(window);

  const [settings, weekTotals, baseline] = await Promise.all([
    settingsService.getSettings(userId),
    sumExpensesByCategory(userId, window),
    computeCategoryBaseline(userId, window.gte),
  ]);

  const created: Alert[] = [];

  for (const [categoryId, weekAmount] of weekTotals) {
    const baselineAmount = baseline.get(categoryId) ?? new Prisma.Decimal(0);
    const threshold = baselineAmount.times(settings.alertAnomalyMultiplier);

    const isAboveBaseline = weekAmount.greaterThan(threshold);
    const isAboveMinimum = weekAmount.greaterThan(settings.alertMinimumAmount);
    if (!isAboveBaseline || !isAboveMinimum) continue;

    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, mesmo padrão de modules/recurring/run.ts (volume trivial: poucas categorias, 2 usuários)
    const existing = await alertRepository.findByDedupKey(userId, AlertType.ANOMALY, [
      { path: ["weekKey"], value: weekKey },
      { path: ["categoryId"], value: categoryId },
    ]);
    if (existing) continue;

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const categoryName = await findCategoryName(userId, categoryId);
    const percentAboveBaseline = baselineAmount.isZero()
      ? null
      : weekAmount.minus(baselineAmount).dividedBy(baselineAmount).times(100).toDecimalPlaces(0).toNumber();

    const payload = {
      weekKey,
      categoryId,
      categoryName,
      weekAmount: weekAmount.toFixed(2),
      baseline: baselineAmount.toFixed(2),
      percentAboveBaseline,
    };

    const message =
      percentAboveBaseline === null
        ? `${categoryName}: R$ ${payload.weekAmount} esta semana — categoria sem histórico suficiente nas últimas 8 semanas.`
        : `${categoryName}: R$ ${payload.weekAmount} esta semana. Média das últimas 8 semanas: R$ ${payload.baseline} (${percentAboveBaseline}% acima do normal).`;

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const alert = await alertRepository.create(userId, {
      type: AlertType.ANOMALY,
      severity: AlertSeverity.WARN,
      title: "Gasto fora do padrão",
      message,
      payload: payload as unknown as Prisma.InputJsonValue,
    });

    created.push(alert);
  }

  return created;
}
