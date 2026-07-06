"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { transactionService } from "./service";
import { createInstallmentPurchase } from "./installments";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listFilterSchema,
  createInstallmentPurchaseSchema,
} from "./schemas";
import { TransactionDomainError } from "./errors";
import type {
  ActionResult,
  Category,
  InstallmentPurchaseResult,
  PaginatedResult,
  TransactionWithTags,
} from "./types";

const TRANSACTIONS_PATH = "/transactions";
const DASHBOARD_PATH = "/dashboard";
const INSTALLMENTS_PATH = "/installments";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof TransactionDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/transactions] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateTransactionRoutes(): void {
  revalidatePath(TRANSACTIONS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createTransactionAction(input: unknown): Promise<ActionResult<TransactionWithTags>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const transaction = await transactionService.createTransaction(userId, parsed.data);
    revalidateTransactionRoutes();
    return { success: true, data: transaction };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateTransactionAction(
  id: string,
  input: unknown,
): Promise<ActionResult<TransactionWithTags>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const transaction = await transactionService.updateTransaction(userId, id, parsed.data);
    revalidateTransactionRoutes();
    return { success: true, data: transaction };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTransactionAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await transactionService.deleteTransaction(userId, id);
    revalidateTransactionRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function undoDeleteTransactionAction(
  id: string,
): Promise<ActionResult<TransactionWithTags>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const transaction = await transactionService.undoDeleteTransaction(userId, id);
    revalidateTransactionRoutes();
    return { success: true, data: transaction };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listTransactionsAction(
  input: unknown,
): Promise<ActionResult<PaginatedResult<TransactionWithTags>>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = listFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const result = await transactionService.list(userId, parsed.data);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createInstallmentPurchaseAction(
  input: unknown,
): Promise<ActionResult<InstallmentPurchaseResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createInstallmentPurchaseSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await createInstallmentPurchase(userId, parsed.data);
    revalidateTransactionRoutes();
    revalidatePath(INSTALLMENTS_PATH);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getLastUsedCategoryAction(
  type: "INCOME" | "EXPENSE",
): Promise<ActionResult<Category | null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const category = await transactionService.lastUsedCategory(userId, type);
    return { success: true, data: category };
  } catch (error) {
    return toActionError(error);
  }
}
