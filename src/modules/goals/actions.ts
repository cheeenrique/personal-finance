"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { goalService } from "./service";
import { createGoalSchema, updateGoalSchema } from "./schemas";
import { GoalDomainError } from "./errors";
import type { ActionResult, GoalProgress, SavingsGoal } from "./types";

const GOALS_PATH = "/goals";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof GoalDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/goals] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

export async function createGoalAction(input: unknown): Promise<ActionResult<SavingsGoal>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const goal = await goalService.createGoal(userId, parsed.data);
    revalidatePath(GOALS_PATH);
    return { success: true, data: goal };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateGoalAction(id: string, input: unknown): Promise<ActionResult<SavingsGoal>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateGoalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const goal = await goalService.updateGoal(userId, id, parsed.data);
    revalidatePath(GOALS_PATH);
    return { success: true, data: goal };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteGoalAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await goalService.deleteGoal(userId, id);
    revalidatePath(GOALS_PATH);
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getGoalAction(id: string): Promise<ActionResult<SavingsGoal>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const goal = await goalService.getGoal(userId, id);
    return { success: true, data: goal };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listGoalsAction(): Promise<ActionResult<SavingsGoal[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const goals = await goalService.listGoals(userId);
    return { success: true, data: goals };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listGoalsWithProgressAction(): Promise<ActionResult<GoalProgress[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const goals = await goalService.listWithProgress(userId);
    return { success: true, data: goals };
  } catch (error) {
    return toActionError(error);
  }
}
