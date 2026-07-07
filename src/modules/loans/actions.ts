"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { loanService } from "./service";
import { createLoan } from "./installments";
import { createLoanSchema } from "./schemas";
import { LoanDomainError } from "./errors";
import type {
  ActionResult,
  ClientCreateLoanResult,
  ClientLoanWithProgress,
  CreateLoanResult,
  LoanWithProgress,
} from "./types";

const LOANS_PATH = "/loans";
const ACCOUNTS_PATH = "/accounts";
const DASHBOARD_PATH = "/dashboard";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof LoanDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/loans] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

/** Empréstimo criado geralmente aparece no histórico da conta e no dashboard (parcelas previstas). */
function revalidateLoanRoutes(): void {
  revalidatePath(LOANS_PATH);
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

/** `Prisma.Decimal` → `string` na borda (ver types.ts `ClientLoanWithProgress`). */
function toClientLoan(loan: LoanWithProgress): ClientLoanWithProgress {
  return {
    ...loan,
    principal: loan.principal.toString(),
    totalToPay: loan.totalToPay.toString(),
    installmentAmount: loan.installmentAmount.toString(),
    interest: loan.interest.toString(),
    paidAmount: loan.paidAmount.toString(),
    remainingAmount: loan.remainingAmount.toString(),
    nextInstallment: loan.nextInstallment
      ? { date: loan.nextInstallment.date, amount: loan.nextInstallment.amount.toString() }
      : null,
  };
}

function toClientCreateLoanResult(result: CreateLoanResult): ClientCreateLoanResult {
  return {
    loan: {
      ...result.loan,
      principal: result.loan.principal.toString(),
      totalToPay: result.loan.totalToPay.toString(),
      installmentAmount: result.loan.installmentAmount.toString(),
    },
    transactions: result.transactions.map((transaction) => ({
      ...transaction,
      amount: transaction.amount.toString(),
    })),
  };
}

export async function createLoanAction(input: unknown): Promise<ActionResult<ClientCreateLoanResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createLoanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await createLoan(userId, parsed.data);
    revalidateLoanRoutes();
    return { success: true, data: toClientCreateLoanResult(result) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listLoansAction(): Promise<ActionResult<ClientLoanWithProgress[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const loans = await loanService.listLoans(userId);
    return { success: true, data: loans.map(toClientLoan) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getLoanAction(id: string): Promise<ActionResult<ClientLoanWithProgress>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const loan = await loanService.getLoan(userId, id);
    return { success: true, data: toClientLoan(loan) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLoanAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await loanService.deleteLoan(userId, id);
    revalidateLoanRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
