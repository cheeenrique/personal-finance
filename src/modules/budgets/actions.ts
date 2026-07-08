"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { budgetService } from "./service";
import { createBudgetSchema, updateBudgetSchema, listBudgetsWithProgressSchema, clonePreviousMonthSchema } from "./schemas";
import { BudgetDomainError } from "./errors";
import type { ActionResult, Budget, BudgetWithProgress, CloneBudgetsResult } from "./types";

const BUDGETS_PATH = "/budgets";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof BudgetDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/budgets] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateBudgetRoutes(): void {
  revalidatePath(BUDGETS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createBudgetAction(input: unknown): Promise<ActionResult<Budget>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const budget = await budgetService.createBudget(userId, parsed.data);
    revalidateBudgetRoutes();
    return { success: true, data: budget };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateBudgetAction(id: string, input: unknown): Promise<ActionResult<Budget>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const budget = await budgetService.updateBudget(userId, id, parsed.data);
    revalidateBudgetRoutes();
    return { success: true, data: budget };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBudgetAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await budgetService.deleteBudget(userId, id);
    revalidateBudgetRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** `input` omitido (ou `{}`) usa mês/ano atual em America/Sao_Paulo. */
export async function listWithProgressAction(input?: unknown): Promise<ActionResult<BudgetWithProgress[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const now = nowInSaoPaulo();
  const parsed = listBudgetsWithProgressSchema.safeParse({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    ...(typeof input === "object" && input !== null ? input : {}),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const budgets = await budgetService.listWithProgress(userId, parsed.data.year, parsed.data.month);
    return { success: true, data: budgets };
  } catch (error) {
    return toActionError(error);
  }
}

/** Clona os budgets ativos do mês anterior pro (year, month) informado — botão "Clonar do mês anterior" em /budgets. */
export async function cloneBudgetsFromPreviousMonthAction(input: unknown): Promise<ActionResult<CloneBudgetsResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = clonePreviousMonthSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await budgetService.cloneFromPreviousMonth(userId, parsed.data.year, parsed.data.month);
    revalidateBudgetRoutes();
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
