import type { Alert } from "@/generated/prisma/client";
import type { AlertType, AlertSeverity } from "@/generated/prisma/enums";

export type { Alert, AlertType, AlertSeverity };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Resultado agregado de UMA execução do cron semanal para UM usuário (ver service.ts `runWeekly`). */
export type WeeklyRunResult = {
  userId: string;
  weeklySummaryCreated: boolean;
  anomaliesCreated: number;
  greenCreated: number;
};

/** Resultado agregado do cron global — soma de todos os usuários (ver route.ts do cron). */
export type CronRunSummary = {
  usersProcessed: number;
  weeklySummaryCreated: number;
  anomaliesCreated: number;
  greenCreated: number;
};
