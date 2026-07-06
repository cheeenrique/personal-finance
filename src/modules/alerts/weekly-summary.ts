import { Prisma, type Alert } from "@/generated/prisma/client";
import { AlertType, AlertSeverity, TransactionType } from "@/generated/prisma/enums";
import { transactionRepository } from "@/modules/transactions/repository";
import { alertRepository } from "./repository";
import { getClosedWeekWindow, getPrecedingWeekWindows, weekKeyFor, weekEndDateKey, type WeekWindow } from "./week";

const TOP_CATEGORIES_LIMIT = 3;

type TopCategory = { categoryId: string; categoryName: string; total: string };

type WeeklySummaryPayload = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  income: string;
  expense: string;
  balance: string;
  topCategories: TopCategory[];
  previousExpense: string;
  deltaExpensePercent: number | null;
};

/**
 * Top N categorias de despesa na janela — mesma composição de
 * `modules/transactions/service.ts` `expensesByCategory`, para janela de
 * SEMANA em vez de mês. Não extraída pra lá: escopo desta task não toca em
 * `modules/transactions` (ver sugestão de melhoria no retorno da task).
 */
async function topCategoriesInWindow(userId: string, window: WeekWindow): Promise<TopCategory[]> {
  const grouped = await transactionRepository.groupExpensesByCategoryInRange(userId, window);

  const categoryIds = grouped
    .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
    .map((row) => row.categoryId);
  const namesById = await transactionRepository.findCategoryNamesByIds(categoryIds);

  return grouped
    .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
    .map((row) => ({
      categoryId: row.categoryId,
      categoryName: namesById.get(row.categoryId) ?? "—",
      total: row.sum.toFixed(2),
    }))
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, TOP_CATEGORIES_LIMIT);
}

/** `null` quando a semana anterior não teve despesa — evita divisão por zero (Δ% fica sem sentido nesse caso). */
function deltaExpensePercent(current: Prisma.Decimal, previous: Prisma.Decimal): number | null {
  if (previous.isZero()) return null;
  return current.minus(previous).dividedBy(previous).times(100).toDecimalPlaces(1).toNumber();
}

function buildMessage(payload: WeeklySummaryPayload): string {
  const deltaText =
    payload.deltaExpensePercent === null
      ? ""
      : ` Δ ${payload.deltaExpensePercent > 0 ? "+" : ""}${payload.deltaExpensePercent}% em despesas vs semana anterior.`;

  return `Receitas: R$ ${payload.income} · Despesas: R$ ${payload.expense} · Saldo: R$ ${payload.balance}.${deltaText}`;
}

/**
 * Gera (ou retorna o já existente, idempotente) o alerta WEEKLY_SUMMARY da
 * semana fechada relativa a `refDate` (docs/29-ALERTS.md, "Resumo Semanal").
 * Severity `INFO`, sempre no máximo 1 por usuário/semana — dedup via
 * `alertRepository.findByDedupKey` (`weekKey`).
 *
 * `TRANSFER` e `CARD_PAYMENT` nunca entram nos totais — naturalmente
 * excluídos por `transactionRepository.sumAmountByTypeInRange`/
 * `groupExpensesByCategoryInRange` (filtram `type` exato + `transferId:
 * null`, ver `modules/transactions/repository.ts`).
 */
export async function generateWeeklySummary(
  userId: string,
  refDate: Date,
): Promise<{ alert: Alert; created: boolean }> {
  const window = getClosedWeekWindow(refDate);
  const weekKey = weekKeyFor(window);

  const existing = await alertRepository.findByDedupKey(userId, AlertType.WEEKLY_SUMMARY, [
    { path: ["weekKey"], value: weekKey },
  ]);
  if (existing) return { alert: existing, created: false };

  const [income, expense, topCategories] = await Promise.all([
    transactionRepository.sumAmountByTypeInRange(userId, TransactionType.INCOME, window),
    transactionRepository.sumAmountByTypeInRange(userId, TransactionType.EXPENSE, window),
    topCategoriesInWindow(userId, window),
  ]);

  const previousWindow = getPrecedingWeekWindows(window.gte, 1)[0];
  const previousExpense = await transactionRepository.sumAmountByTypeInRange(
    userId,
    TransactionType.EXPENSE,
    previousWindow,
  );

  const balance = income.minus(expense);

  const payload: WeeklySummaryPayload = {
    weekKey,
    weekStart: weekKey,
    weekEnd: weekEndDateKey(window),
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    balance: balance.toFixed(2),
    topCategories,
    previousExpense: previousExpense.toFixed(2),
    deltaExpensePercent: deltaExpensePercent(expense, previousExpense),
  };

  const alert = await alertRepository.create(userId, {
    type: AlertType.WEEKLY_SUMMARY,
    severity: AlertSeverity.INFO,
    title: "Resumo da semana",
    message: buildMessage(payload),
    payload: payload as unknown as Prisma.InputJsonValue,
  });

  return { alert, created: true };
}
