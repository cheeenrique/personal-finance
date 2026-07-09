"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { transactionService } from "./service";
import {
  createInstallmentPurchase,
  cancelInstallmentPurchase,
  updateInstallmentPurchaseCategory,
} from "./installments";
import {
  createTransactionSchema,
  updateTransactionSchema,
  listFilterSchema,
  createInstallmentPurchaseSchema,
  updateInstallmentPurchaseCategorySchema,
} from "./schemas";
import { TransactionDomainError } from "./errors";
import type {
  ActionResult,
  Category,
  ClientTransaction,
  InstallmentPurchaseResult,
  PaginatedResult,
  TransactionWithTags,
} from "./types";

const TRANSACTIONS_PATH = "/transactions";
const DASHBOARD_PATH = "/dashboard";
const INSTALLMENTS_PATH = "/installments";
const ACCOUNTS_PATH = "/accounts";

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
  // Toda mutação de transação mexe no saldo da conta (transferência mexe em 2)
  // — revalida o grid de contas junto, senão os saldos ficam desatualizados.
  revalidatePath(ACCOUNTS_PATH);
}

/** `Prisma.Decimal` → `string` na borda (ver types.ts `ClientTransaction`). */
function toClientTransaction(transaction: TransactionWithTags): ClientTransaction {
  return { ...transaction, amount: transaction.amount.toString() };
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

/** Leitura pontual (sem revalidate — não muta nada). Ver `transactionService.getTransaction`. */
export async function getTransactionAction(id: string): Promise<ActionResult<ClientTransaction>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const transaction = await transactionService.getTransaction(userId, id);
    return { success: true, data: toClientTransaction(transaction) };
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
): Promise<ActionResult<PaginatedResult<ClientTransaction>>> {
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
    return { success: true, data: { ...result, items: result.items.map(toClientTransaction) } };
  } catch (error) {
    return toActionError(error);
  }
}

/** `installmentsCount` por `installmentPurchaseId` — insumo do badge "N/total" (docs/23-INSTALLMENTS.md). */
export async function getInstallmentTotalsAction(
  installmentPurchaseIds: string[],
): Promise<ActionResult<Record<string, number>>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const totals = await transactionService.installmentTotals(userId, installmentPurchaseIds);
    return { success: true, data: Object.fromEntries(totals) };
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

/** Cancela uma compra parcelada — soft-delete das parcelas futuras (ver `installments.ts` `cancelInstallmentPurchase`, docs/23-INSTALLMENTS.md "Cancelamento"). */
export async function cancelInstallmentPurchaseAction(purchaseId: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await cancelInstallmentPurchase(userId, purchaseId);
    revalidateTransactionRoutes();
    revalidatePath(INSTALLMENTS_PATH);
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

/** Troca a categoria de todas as parcelas vivas da compra (docs/23-INSTALLMENTS.md). */
export async function updateInstallmentPurchaseCategoryAction(
  purchaseId: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateInstallmentPurchaseCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    await updateInstallmentPurchaseCategory(userId, purchaseId, parsed.data);
    revalidateTransactionRoutes();
    revalidatePath(INSTALLMENTS_PATH);
    return { success: true, data: null };
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

/** Autocomplete do campo Descrição (ver `DescriptionAutocomplete`) — sugestões vindas das próprias transações do usuário. */
export async function suggestDescriptionsAction(query: string): Promise<ActionResult<string[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const suggestions = await transactionService.suggestDescriptions(userId, query);
    return { success: true, data: suggestions };
  } catch (error) {
    return toActionError(error);
  }
}

/** Bônus do autocomplete de Descrição — categoria da transação mais recente com a mesma descrição. */
export async function getLastCategoryByDescriptionAction(
  description: string,
): Promise<ActionResult<Category | null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const category = await transactionService.lastCategoryForDescription(userId, description);
    return { success: true, data: category };
  } catch (error) {
    return toActionError(error);
  }
}
