"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { alertService } from "./service";
import { listAlertsSchema } from "./schemas";
import { AlertDomainError } from "./errors";
import type { ActionResult, Alert } from "./types";

const ALERTS_PATH = "/alerts";
const DASHBOARD_PATH = "/dashboard";

/**
 * Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de
 * Ouro"). Geração de alertas NÃO é Server Action — é responsabilidade do cron
 * (`src/app/api/cron/weekly-summary/route.ts`, docs/29-ALERTS.md, "Regra
 * Principal": alerta nunca é criado manualmente pelo usuário). Este módulo só
 * expõe leitura e marcação de lido para a UI.
 */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof AlertDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/alerts] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateAlertRoutes(): void {
  revalidatePath(ALERTS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function listAlertsAction(input?: unknown): Promise<ActionResult<Alert[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = listAlertsSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const alerts = await alertService.listAlerts(userId, parsed.data);
    return { success: true, data: alerts };
  } catch (error) {
    return toActionError(error);
  }
}

export async function markReadAction(id: string): Promise<ActionResult<Alert>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const alert = await alertService.markRead(userId, id);
    revalidateAlertRoutes();
    return { success: true, data: alert };
  } catch (error) {
    return toActionError(error);
  }
}
