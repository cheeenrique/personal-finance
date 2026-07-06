"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { recurringService } from "./service";
import { createRecurringTransactionSchema, updateRecurringTransactionSchema } from "./schemas";
import { RecurringDomainError } from "./errors";
import type { ActionResult, RecurringTransaction } from "./types";

const RECURRING_PATH = "/recurring";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof RecurringDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/recurring] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateRecurringRoutes(): void {
  revalidatePath(RECURRING_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createRecurringTransactionAction(
  input: unknown,
): Promise<ActionResult<RecurringTransaction>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createRecurringTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const recurring = await recurringService.createRecurringTransaction(userId, parsed.data);
    revalidateRecurringRoutes();
    return { success: true, data: recurring };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateRecurringTransactionAction(
  id: string,
  input: unknown,
): Promise<ActionResult<RecurringTransaction>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateRecurringTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const recurring = await recurringService.updateRecurringTransaction(userId, id, parsed.data);
    revalidateRecurringRoutes();
    return { success: true, data: recurring };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteRecurringTransactionAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await recurringService.deleteRecurringTransaction(userId, id);
    revalidateRecurringRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleActiveAction(id: string): Promise<ActionResult<RecurringTransaction>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const recurring = await recurringService.toggleActive(userId, id);
    revalidateRecurringRoutes();
    return { success: true, data: recurring };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listRecurringTransactionsAction(): Promise<ActionResult<RecurringTransaction[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const recurring = await recurringService.list(userId);
    return { success: true, data: recurring };
  } catch (error) {
    return toActionError(error);
  }
}
