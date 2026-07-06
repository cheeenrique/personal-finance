import { prisma } from "@/lib/db/client";
import { Prisma, type Alert } from "@/generated/prisma/client";
import { AlertType, AlertSeverity, TransactionType } from "@/generated/prisma/enums";
import { transactionRepository } from "@/modules/transactions/repository";
import { settingsService } from "@/modules/settings/service";
import { alertRepository } from "./repository";
import {
  getClosedWeekWindow,
  getPrecedingWeekWindows,
  weekKeyFor,
  weekEndsMonth,
  monthWindow,
  type WeekWindow,
} from "./week";
import { sumExpensesByCategory, computeCategoryBaseline, findCategoryName, BASELINE_WEEKS } from "./anomaly";

/**
 * Condição (a) — docs/29-ALERTS.md, "Alerta Verde": gasto da semana numa
 * categoria abaixo de `baseline * alertGreenMultiplier`. Categorias sem
 * histórico (`baseline = 0`) são ignoradas — sem base de comparação, mesmo
 * racional do `alertMinimumAmount` em anomaly.ts (evita ruído).
 */
async function detectCategoryGreen(
  userId: string,
  weekKey: string,
  window: WeekWindow,
  greenMultiplier: Prisma.Decimal,
): Promise<Alert[]> {
  const [weekTotals, baseline] = await Promise.all([
    sumExpensesByCategory(userId, window),
    computeCategoryBaseline(userId, window.gte),
  ]);

  const categoryIds = new Set<string>([...weekTotals.keys(), ...baseline.keys()]);
  const created: Alert[] = [];

  for (const categoryId of categoryIds) {
    const baselineAmount = baseline.get(categoryId) ?? new Prisma.Decimal(0);
    if (baselineAmount.isZero()) continue;

    const weekAmount = weekTotals.get(categoryId) ?? new Prisma.Decimal(0);
    const threshold = baselineAmount.times(greenMultiplier);
    if (!weekAmount.lessThan(threshold)) continue;

    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, volume trivial (poucas categorias, 2 usuários)
    const existing = await alertRepository.findByDedupKey(userId, AlertType.GREEN, [
      { path: ["weekKey"], value: weekKey },
      { path: ["kind"], value: "CATEGORY" },
      { path: ["categoryId"], value: categoryId },
    ]);
    if (existing) continue;

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const categoryName = await findCategoryName(userId, categoryId);
    const percentBelowBaseline = baselineAmount
      .minus(weekAmount)
      .dividedBy(baselineAmount)
      .times(100)
      .toDecimalPlaces(0)
      .toNumber();

    const payload = {
      weekKey,
      kind: "CATEGORY" as const,
      categoryId,
      categoryName,
      weekAmount: weekAmount.toFixed(2),
      baseline: baselineAmount.toFixed(2),
      percentBelowBaseline,
    };

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const alert = await alertRepository.create(userId, {
      type: AlertType.GREEN,
      severity: AlertSeverity.GOOD,
      title: "Você economizou",
      message: `${categoryName}: R$ ${payload.weekAmount} esta semana. Média das últimas 8 semanas: R$ ${payload.baseline} (${percentBelowBaseline}% abaixo do normal).`,
      payload: payload as unknown as Prisma.InputJsonValue,
    });

    created.push(alert);
  }

  return created;
}

async function weekBalance(userId: string, window: WeekWindow): Promise<Prisma.Decimal> {
  const [income, expense] = await Promise.all([
    transactionRepository.sumAmountByTypeInRange(userId, TransactionType.INCOME, window),
    transactionRepository.sumAmountByTypeInRange(userId, TransactionType.EXPENSE, window),
  ]);
  return income.minus(expense);
}

/** Condição (c) — docs/29-ALERTS.md, "Alerta Verde": saldo da semana acima da média das últimas 8 semanas. */
async function detectBalanceGreen(userId: string, weekKey: string, window: WeekWindow): Promise<Alert | null> {
  const baselineWindows = getPrecedingWeekWindows(window.gte, BASELINE_WEEKS);

  const [currentBalance, baselineBalances] = await Promise.all([
    weekBalance(userId, window),
    Promise.all(baselineWindows.map((baselineWindow) => weekBalance(userId, baselineWindow))),
  ]);

  const baselineSum = baselineBalances.reduce((acc, value) => acc.plus(value), new Prisma.Decimal(0));
  const averageBalance = baselineSum.dividedBy(BASELINE_WEEKS);

  if (!currentBalance.greaterThan(averageBalance)) return null;

  const existing = await alertRepository.findByDedupKey(userId, AlertType.GREEN, [
    { path: ["weekKey"], value: weekKey },
    { path: ["kind"], value: "BALANCE" },
  ]);
  if (existing) return null;

  const payload = {
    weekKey,
    kind: "BALANCE" as const,
    weekBalance: currentBalance.toFixed(2),
    averageBalance: averageBalance.toFixed(2),
  };

  return alertRepository.create(userId, {
    type: AlertType.GREEN,
    severity: AlertSeverity.GOOD,
    title: "Saldo acima da média",
    message: `Saldo da semana: R$ ${payload.weekBalance}. Média das últimas 8 semanas: R$ ${payload.averageBalance}.`,
    payload: payload as unknown as Prisma.InputJsonValue,
  });
}

/**
 * Condição (b) — docs/29-ALERTS.md, "Alerta Verde": mês fechou abaixo do
 * orçamento da categoria. Avaliado só na semana em que o último dia (sábado)
 * é o último dia calendário do mês (`weekEndsMonth`). Consulta `Budget`
 * DIRETO via Prisma — não importa `modules/budgets` (em construção em
 * paralelo, restrição explícita da task).
 */
async function detectBudgetGreen(userId: string, weekKey: string, window: WeekWindow): Promise<Alert[]> {
  const closingMonth = weekEndsMonth(window);
  if (!closingMonth) return [];

  const { year, month } = closingMonth;
  const budgets = await prisma.budget.findMany({ where: { userId, year, month, deletedAt: null } });
  if (budgets.length === 0) return [];

  const monthlySpend = await transactionRepository.groupExpensesByCategoryInRange(userId, monthWindow(year, month));
  const spendByCategory = new Map(monthlySpend.map((row) => [row.categoryId, row.sum]));

  const created: Alert[] = [];

  for (const budget of budgets) {
    const actual = spendByCategory.get(budget.categoryId) ?? new Prisma.Decimal(0);
    if (!actual.lessThan(budget.plannedAmount)) continue;

    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, volume trivial (poucos budgets, 2 usuários)
    const existing = await alertRepository.findByDedupKey(userId, AlertType.GREEN, [
      { path: ["weekKey"], value: weekKey },
      { path: ["kind"], value: "BUDGET" },
      { path: ["categoryId"], value: budget.categoryId },
    ]);
    if (existing) continue;

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const categoryName = await findCategoryName(userId, budget.categoryId);

    const payload = {
      weekKey,
      kind: "BUDGET" as const,
      categoryId: budget.categoryId,
      categoryName,
      year,
      month,
      planned: budget.plannedAmount.toFixed(2),
      actual: actual.toFixed(2),
    };

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const alert = await alertRepository.create(userId, {
      type: AlertType.GREEN,
      severity: AlertSeverity.GOOD,
      title: "Orçamento respeitado",
      message: `${categoryName}: gastou R$ ${payload.actual} de R$ ${payload.planned} planejados em ${month}/${year}.`,
      payload: payload as unknown as Prisma.InputJsonValue,
    });

    created.push(alert);
  }

  return created;
}

/**
 * Detecta e persiste alertas GREEN (docs/29-ALERTS.md, "Alerta Verde
 * (economia)"): (a) categoria com gasto bem abaixo do baseline, (b) mês
 * fechado abaixo do orçamento da categoria, (c) saldo da semana acima da
 * média — independentes entre si, qualquer uma dispara. Idempotente por
 * semana/categoria/tipo (dedup via `alertRepository.findByDedupKey`).
 */
export async function detectGreen(userId: string, refDate: Date): Promise<Alert[]> {
  const window = getClosedWeekWindow(refDate);
  const weekKey = weekKeyFor(window);
  const settings = await settingsService.getSettings(userId);

  const [categoryAlerts, balanceAlert, budgetAlerts] = await Promise.all([
    detectCategoryGreen(userId, weekKey, window, settings.alertGreenMultiplier),
    detectBalanceGreen(userId, weekKey, window),
    detectBudgetGreen(userId, weekKey, window),
  ]);

  return [...categoryAlerts, ...(balanceAlert ? [balanceAlert] : []), ...budgetAlerts];
}
