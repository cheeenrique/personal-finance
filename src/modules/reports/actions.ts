"use server";

import { auth } from "@/lib/auth";
import { reportService } from "./service";
import { reportCsv } from "./csv";
import { yearFilterSchema, monthFilterSchema, dateRangeSchema, csvFilterSchema } from "./schemas";
import { ReportDomainError } from "./errors";
import type {
  AccountMovementReport,
  ActionResult,
  CashflowReport,
  CategoryExpenseTotal,
  IncomeExpenseMonthPoint,
  TotalEvolutionPoint,
} from "./types";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). Reports são só-leitura — sem revalidatePath. */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof ReportDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/reports] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

export async function getIncomeVsExpenseByMonthAction(
  input: unknown,
): Promise<ActionResult<IncomeExpenseMonthPoint[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = yearFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const result = await reportService.incomeVsExpenseByMonth(userId, parsed.data.year);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getExpenseByCategoryAction(
  input: unknown,
): Promise<ActionResult<CategoryExpenseTotal[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = monthFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const result = await reportService.expenseByCategory(userId, parsed.data.year, parsed.data.month);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getCashflowAction(input: unknown): Promise<ActionResult<CashflowReport>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = dateRangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const result = await reportService.cashflow(userId, parsed.data.dateFrom, parsed.data.dateTo);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getAccountReportAction(
  input: unknown,
): Promise<ActionResult<AccountMovementReport[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = dateRangeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const result = await reportService.accountReport(userId, parsed.data.dateFrom, parsed.data.dateTo);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function getPatrimonyEvolutionAction(): Promise<ActionResult<TotalEvolutionPoint[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const result = await reportService.patrimonyEvolution(userId);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}

export async function exportCSVAction(input: unknown): Promise<ActionResult<string>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = csvFilterSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Filtros inválidos." },
    };
  }

  try {
    const csv = await reportCsv.exportTransactionsCSV(userId, parsed.data);
    return { success: true, data: csv };
  } catch (error) {
    return toActionError(error);
  }
}
