import { Prisma, type Alert } from "@/generated/prisma/client";
import { AlertType, AlertSeverity, TransactionType } from "@/generated/prisma/enums";
import { transactionRepository } from "@/modules/transactions/repository";
import { reportService } from "@/modules/reports/service";
import { alertRepository } from "./repository";
import { getClosedWeekWindow, getPrecedingWeekWindows, weekKeyFor, weekEndDateKey, type WeekWindow } from "./week";

const TOP_CATEGORIES_LIMIT = 3;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type TopCategory = { categoryId: string; categoryName: string; total: string };

/** Formato do `payload` JSON do Alert `WEEKLY_SUMMARY` — reaproveitado pelo box do Dashboard (ver service.ts `getWeeklySummaryForDashboard`). */
export type WeeklySummaryPayload = {
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
 * Top N categorias de despesa na janela — MESMA base de Fluxo de Caixa de
 * `sumAmountByTypeInRange` abaixo (conta-only via `cardId IS NULL`,
 * `COALESCE(paidAt, date)`, só paga, sem transfer): reusa a função canônica
 * `reportService.categoryTotals` (a mesma que alimenta "/reports" e o
 * Telegram) em vez de `transactionRepository.groupExpensesByCategoryInRange`
 * (accrual por `date` + inclui cartão) — antes o resumo semanal misturava as
 * 2 bases no mesmo alerta (L8): uma semana só com compra no cartão mostrava
 * "Despesas: R$0" (caixa) com top categorias cheias (accrual+cartão), e
 * GREEN/ANOMALY comparavam categoria (accrual) com saldo (caixa). `window` é
 * `[gte, lt)`; `categoryTotals` espera `dateTo` como a meia-noite SP do
 * ÚLTIMO dia incluso (estende o fim do dia por dentro,
 * `reports/service.ts` `endOfDayInclusive`) — por isso subtraímos 1 dia de
 * `window.lt` (que já é a meia-noite SP do dia SEGUINTE ao fim da janela).
 * Sem risco de DST (Brasil não observa desde 2019), mesmo racional de
 * `endOfDayInclusive`.
 */
async function topCategoriesInWindow(userId: string, window: WeekWindow): Promise<TopCategory[]> {
  const lastDayOfWindow = new Date(window.lt.getTime() - ONE_DAY_MS);
  const totals = await reportService.categoryTotals(userId, window.gte, lastDayOfWindow);

  return totals
    .slice(0, TOP_CATEGORIES_LIMIT)
    .map((row) => ({ categoryId: row.categoryId, categoryName: row.categoryName, total: row.total.toFixed(2) }));
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
 * excluídos por `transactionRepository.sumAmountByTypeInRange` (income/expense)
 * e `reportService.categoryTotals` (topCategories), MESMA base de Fluxo de
 * Caixa nos dois (`type` exato + `transferId IS NULL` + `cardId IS NULL`, ver
 * `topCategoriesInWindow` acima).
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
