"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { investmentService } from "./service";
import {
  contributeToInvestmentSchema,
  createInvestmentSchema,
  projectYieldSchema,
  updateInvestmentSchema,
  upsertCdiManualSchema,
} from "./schemas";
import { InvestmentDomainError } from "./errors";
import type { ActionResult, CdiQuoteView, YieldProjection } from "./types";
import type { Asset } from "@/generated/prisma/client";

const INVESTMENTS_PATH = "/investments";
const ASSETS_PATH = "/assets";
const ACCOUNTS_PATH = "/accounts";
const TRANSACTIONS_PATH = "/transactions";
const DASHBOARD_PATH = "/dashboard";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof InvestmentDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/investments] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateInvestmentRoutes(): void {
  revalidatePath(INVESTMENTS_PATH);
  revalidatePath(ASSETS_PATH);
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath(TRANSACTIONS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createInvestmentAction(input: unknown): Promise<ActionResult<Asset>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createInvestmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const asset = await investmentService.createInvestment(userId, parsed.data);
    revalidateInvestmentRoutes();
    return { success: true, data: asset };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateInvestmentAction(
  id: string,
  input: unknown,
): Promise<ActionResult<Asset>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateInvestmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const asset = await investmentService.updateInvestment(userId, id, parsed.data);
    revalidateInvestmentRoutes();
    return { success: true, data: asset };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteInvestmentAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await investmentService.deleteInvestment(userId, id);
    revalidateInvestmentRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function contributeToInvestmentAction(
  investmentId: string,
  input: unknown,
): Promise<ActionResult<{ transactionId: string }>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = contributeToInvestmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await investmentService.contribute(userId, investmentId, parsed.data);
    revalidateInvestmentRoutes();
    return { success: true, data: { transactionId: result.transactionId } };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getCdiQuoteAction(): Promise<ActionResult<CdiQuoteView | null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const quote = await investmentService.getCdi();
    return { success: true, data: quote };
  } catch (error) {
    return toActionError(error);
  }
}

export async function upsertCdiManualAction(input: unknown): Promise<ActionResult<CdiQuoteView>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = upsertCdiManualSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const quote = await investmentService.setCdiManual(parsed.data);
    revalidatePath(INVESTMENTS_PATH);
    return { success: true, data: quote };
  } catch (error) {
    return toActionError(error);
  }
}

export async function projectYieldAction(input: unknown): Promise<ActionResult<YieldProjection>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = projectYieldSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    return { success: true, data: investmentService.project(parsed.data) };
  } catch (error) {
    return toActionError(error);
  }
}
