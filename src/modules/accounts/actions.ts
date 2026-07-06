"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { accountService } from "./service";
import { createTransfer } from "./transfer";
import { createAccountSchema, updateAccountSchema, transferSchema } from "./schemas";
import { AccountDomainError } from "./errors";
import type { Account, AccountWithBalance, ActionResult, TransferResult } from "./types";

const ACCOUNTS_PATH = "/accounts";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof AccountDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/accounts] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateAccountRoutes(): void {
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createAccountAction(input: unknown): Promise<ActionResult<Account>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const account = await accountService.createAccount(userId, parsed.data);
    revalidateAccountRoutes();
    return { success: true, data: account };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateAccountAction(id: string, input: unknown): Promise<ActionResult<Account>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const account = await accountService.updateAccount(userId, id, parsed.data);
    revalidateAccountRoutes();
    return { success: true, data: account };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteAccountAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await accountService.deleteAccount(userId, id);
    revalidateAccountRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listAccountsAction(): Promise<ActionResult<AccountWithBalance[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const accounts = await accountService.listWithBalances(userId);
    return { success: true, data: accounts };
  } catch (error) {
    return toActionError(error);
  }
}

export async function createTransferAction(input: unknown): Promise<ActionResult<TransferResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await createTransfer(userId, parsed.data);
    revalidateAccountRoutes();
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
