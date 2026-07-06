import { Prisma } from "@/generated/prisma/client";
import { transactionService } from "@/modules/transactions/service";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { accountService } from "@/modules/accounts/service";
import { AccountDomainError } from "@/modules/accounts/errors";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { resolveCategoryId, resolveDefaultAccountId } from "./resolve";
import {
  buildBalanceReply,
  buildErrorReply,
  buildMonthExpensesReply,
  buildTodaySummaryReply,
  buildTransactionConfirmationReply,
  buildUnknownReply,
} from "./reply";
import { TelegramDomainError } from "./errors";
import type { CommandResult, ParsedCommand } from "./types";

function isKnownDomainError(error: unknown): error is Error {
  return (
    error instanceof TelegramDomainError ||
    error instanceof TransactionDomainError ||
    error instanceof AccountDomainError
  );
}

/** Regra 2/3 (docs/30-TELEGRAM.md): categoria nunca fica nula, data default = agora. Conta default = `resolveDefaultAccountId` (ver resolve.ts). */
async function handleCreateTransaction(
  userId: string,
  command: Extract<ParsedCommand, { kind: "create_transaction" }>,
): Promise<CommandResult> {
  const [category, accountId] = await Promise.all([
    resolveCategoryId(userId, command.type, command.keywordCandidates),
    resolveDefaultAccountId(userId),
  ]);

  const parsed = createTransactionSchema.safeParse({
    description: command.description,
    amount: command.amount,
    type: command.type,
    categoryId: category.id,
    accountId,
  });

  if (!parsed.success) {
    return {
      text: buildErrorReply(parsed.error.issues[0]?.message ?? "Dados inválidos."),
      resultCode: "validation_error",
    };
  }

  await transactionService.createTransaction(userId, parsed.data);

  return {
    text: buildTransactionConfirmationReply({
      type: command.type,
      description: command.description,
      amount: command.amount,
      categoryName: category.name,
    }),
    resultCode: "transaction_created",
  };
}

async function handleQueryBalance(userId: string): Promise<CommandResult> {
  const total = await accountService.totalBalance(userId);
  return { text: buildBalanceReply(total.toString()), resultCode: "balance_queried" };
}

async function handleQueryMonthExpenses(userId: string): Promise<CommandResult> {
  const now = nowInSaoPaulo();
  const categories = await transactionService.expensesByCategory(userId, now.getFullYear(), now.getMonth() + 1);
  const total = categories.reduce((sum, category) => sum.plus(category.total), new Prisma.Decimal(0));

  return {
    text: buildMonthExpensesReply(
      categories.map((category) => ({ name: category.categoryName, total: category.total.toString() })),
      total.toString(),
    ),
    resultCode: "month_expenses_queried",
  };
}

/** Sem agregação diária pronta em nenhum módulo existente — reusa `transactionService.list` (já exportado) em vez de tocar no módulo transactions. */
async function handleQueryToday(userId: string): Promise<CommandResult> {
  const now = nowInSaoPaulo();
  const startOfDayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const result = await transactionService.list(userId, {
    type: "EXPENSE",
    dateFrom: parseInSaoPaulo(startOfDayLocal),
    dateTo: parseInSaoPaulo(endOfDayLocal),
    page: 1,
    pageSize: 100,
    sort: "date_desc",
  });

  const total = result.items.reduce((sum, transaction) => sum.plus(transaction.amount), new Prisma.Decimal(0));

  return { text: buildTodaySummaryReply(total.toString()), resultCode: "today_summary_queried" };
}

/**
 * Executa o comando resolvido pelo parser pro `userId` já validado pela
 * allowlist (ver route.ts). Erros de domínio conhecidos viram resposta
 * amigável (mesma mensagem já usada nas Server Actions do app); erros
 * inesperados nunca vazam detalhe interno — resposta genérica + log só do
 * `kind` do comando (nunca o texto/valor da mensagem).
 */
async function executeCommand(userId: string, command: ParsedCommand): Promise<CommandResult> {
  try {
    switch (command.kind) {
      case "create_transaction":
        return await handleCreateTransaction(userId, command);
      case "query_balance":
        return await handleQueryBalance(userId);
      case "query_month_expenses":
        return await handleQueryMonthExpenses(userId);
      case "query_today":
        return await handleQueryToday(userId);
      case "unknown":
        return { text: buildUnknownReply(), resultCode: "unknown_message" };
    }
  } catch (error) {
    if (isKnownDomainError(error)) {
      return { text: buildErrorReply(error.message), resultCode: "error" };
    }

    console.error("[modules/telegram] unexpected error executing command", { kind: command.kind });
    return {
      text: buildErrorReply("Não foi possível processar sua mensagem agora."),
      resultCode: "error",
    };
  }
}

export const telegramHandlers = { executeCommand };
