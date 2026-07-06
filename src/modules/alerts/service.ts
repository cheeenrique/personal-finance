import { AlertType } from "@/generated/prisma/enums";
import { generateWeeklySummary, type WeeklySummaryPayload } from "./weekly-summary";
import { detectAnomalies } from "./anomaly";
import { detectGreen } from "./green";
import { isWeeklySummaryWindowOpen } from "./week";
import { alertRepository, type AlertListFilter } from "./repository";
import { AlertNotFoundError } from "./errors";
import type { Alert, WeeklyRunResult, CronRunSummary } from "./types";

/**
 * Orquestra a geração semanal de UM usuário: resumo + anomalia + verde, nessa
 * ordem (docs/29-ALERTS.md, "O que o cron faz"). Idempotente — cada gerador
 * já checa existência antes de criar (dedup por `weekKey`, ver
 * `repository.ts` `findByDedupKey`), então rodar `runWeekly` 2x com o mesmo
 * `refDate` não duplica nenhum Alert.
 */
async function runWeekly(userId: string, refDate: Date = new Date()): Promise<WeeklyRunResult> {
  const { created: weeklySummaryCreated } = await generateWeeklySummary(userId, refDate);
  const anomalies = await detectAnomalies(userId, refDate);
  const green = await detectGreen(userId, refDate);

  return {
    userId,
    weeklySummaryCreated,
    anomaliesCreated: anomalies.length,
    greenCreated: green.length,
  };
}

/**
 * Roda `runWeekly` para TODOS os usuários — cron global
 * (`/api/cron/weekly-summary`). Sequencial por usuário, não `Promise.all`
 * (mesmo racional de `modules/recurring/run.ts` `runDue`: volume de 2
 * usuários não justifica paralelismo, e evita contenção no pool de conexões).
 */
async function runWeeklyForAllUsers(refDate: Date = new Date()): Promise<CronRunSummary> {
  const userIds = await alertRepository.listAllUserIds();
  const results: WeeklyRunResult[] = [];

  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, ver JSDoc acima
    const result = await runWeekly(userId, refDate);
    results.push(result);
  }

  return {
    usersProcessed: results.length,
    weeklySummaryCreated: results.filter((result) => result.weeklySummaryCreated).length,
    anomaliesCreated: results.reduce((total, result) => total + result.anomaliesCreated, 0),
    greenCreated: results.reduce((total, result) => total + result.greenCreated, 0),
  };
}

async function listAlerts(userId: string, filters: AlertListFilter = {}): Promise<Alert[]> {
  return alertRepository.list(userId, filters);
}

async function markRead(userId: string, id: string): Promise<Alert> {
  const updated = await alertRepository.markRead(userId, id);
  if (!updated) throw new AlertNotFoundError(id);
  return updated;
}

async function listActiveForDashboard(userId: string): Promise<Alert[]> {
  return alertRepository.listActiveForDashboard(userId);
}

/**
 * Payload do WEEKLY_SUMMARY mais recente, só dentro da janela de exibição do
 * box (docs/11-DASHBOARD.md, docs/29-ALERTS.md "Janela de exibição"). Fora
 * da janela, ou sem alerta ainda gerado (cron não rodou), retorna `null` — o
 * Dashboard simplesmente não renderiza o box (não é um erro).
 */
async function getWeeklySummaryForDashboard(
  userId: string,
  refDate: Date = new Date(),
): Promise<WeeklySummaryPayload | null> {
  if (!isWeeklySummaryWindowOpen(refDate)) return null;

  const [latest] = await alertRepository.list(userId, { type: AlertType.WEEKLY_SUMMARY });
  if (!latest) return null;

  return latest.payload as unknown as WeeklySummaryPayload;
}

export const alertService = {
  runWeekly,
  runWeeklyForAllUsers,
  listAlerts,
  markRead,
  listActiveForDashboard,
  getWeeklySummaryForDashboard,
};
