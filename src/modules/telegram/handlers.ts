import { Prisma } from "@/generated/prisma/client";
import { transactionService } from "@/modules/transactions/service";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { accountService } from "@/modules/accounts/service";
import { AccountDomainError } from "@/modules/accounts/errors";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { parseTransactionWithAI } from "./ai-parser";
import {
  listCategoryNamesForAI,
  listOriginNamesForAI,
  resolveCategoryByName,
  resolveCategoryId,
  resolveOrigin,
} from "./resolve";
import {
  buildBalanceReply,
  buildErrorReply,
  buildMonthExpensesReply,
  buildTodaySummaryReply,
  buildTransactionConfirmationReply,
  buildUnknownReply,
} from "./reply";
import { TelegramDomainError } from "./errors";
import type { AiParsedTransaction, CommandResult, ParsedCommand, TelegramOrigin } from "./types";

function isKnownDomainError(error: unknown): error is Error {
  return (
    error instanceof TelegramDomainError ||
    error instanceof TransactionDomainError ||
    error instanceof AccountDomainError
  );
}

/** `{ accountId }` ou `{ cardId } ` pro payload de `createTransactionSchema` — nunca os dois juntos (invariante do schema). */
function originPayload(origin: TelegramOrigin): { accountId: string } | { cardId: string } {
  return origin.kind === "card" ? { cardId: origin.id } : { accountId: origin.id };
}

/** Regra 2/3 (docs/30-TELEGRAM.md): categoria nunca fica nula, data default = agora. Origem default = `resolveOrigin` sem kind/name (mesma conta ativa mais antiga de sempre, ver resolve.ts). */
async function handleCreateTransaction(
  userId: string,
  command: Extract<ParsedCommand, { kind: "create_transaction" }>,
): Promise<CommandResult> {
  const [category, origin] = await Promise.all([
    resolveCategoryId(userId, command.type, command.keywordCandidates),
    resolveOrigin(userId, null, null),
  ]);

  const parsed = createTransactionSchema.safeParse({
    description: command.description,
    amount: command.amount,
    type: command.type,
    categoryId: category.id,
    ...originPayload(origin),
  });

  if (!parsed.success) {
    return {
      text: buildErrorReply(parsed.error.issues[0]?.message ?? "Dados inválidos."),
      resultCode: "validation_error",
    };
  }

  const created = await transactionService.createTransaction(userId, parsed.data);

  return {
    text: buildTransactionConfirmationReply({
      type: command.type,
      description: command.description,
      amount: command.amount,
      categoryName: category.name,
      originLabel: origin.label,
      date: created.date,
      isPaid: created.isPaid,
    }),
    resultCode: "transaction_created",
  };
}

/**
 * Lançamento a partir da saída já validada da IA (docs/30-TELEGRAM.md,
 * "Parsing por IA"). Regra determinística — NUNCA decidida pela IA: data
 * resolvida > hoje (America/Sao_Paulo) = previsto (`isPaid=false`); senão
 * pago (`isPaid=true`). Comparação por string `YYYY-MM-DD` (ISO, ordena
 * lexicograficamente igual a cronologicamente — sem parse de Date aqui).
 */
async function handleAiTransaction(userId: string, ai: AiParsedTransaction): Promise<CommandResult> {
  const today = toDateInputValueSaoPaulo();
  const dateStr = ai.date ?? today;
  const isPaid = dateStr <= today;
  const keywordCandidates = [ai.categoryName, ai.description].filter((value): value is string => Boolean(value));

  const [category, origin] = await Promise.all([
    resolveCategoryByName(userId, ai.type, ai.categoryName, keywordCandidates),
    resolveOrigin(userId, ai.originKind, ai.originName),
  ]);

  const parsed = createTransactionSchema.safeParse({
    description: ai.description,
    amount: ai.amount,
    type: ai.type,
    categoryId: category.id,
    ...originPayload(origin),
    date: dateStr,
    isPaid,
  });

  if (!parsed.success) {
    return {
      text: buildErrorReply(parsed.error.issues[0]?.message ?? "Dados inválidos."),
      resultCode: "validation_error",
    };
  }

  const created = await transactionService.createTransaction(userId, parsed.data);

  return {
    text: buildTransactionConfirmationReply({
      type: ai.type,
      description: ai.description,
      amount: ai.amount,
      categoryName: category.name,
      originLabel: origin.label,
      date: created.date,
      isPaid: created.isPaid,
    }),
    resultCode: "transaction_created",
  };
}

/** Insumo do prompt da IA — categorias/contas/cartões reais do usuário + "hoje" em SP (docs/30-TELEGRAM.md, "Parsing por IA"). */
async function buildAiContext(userId: string) {
  const [categoryNames, origins] = await Promise.all([
    listCategoryNamesForAI(userId),
    listOriginNamesForAI(userId),
  ]);

  return {
    todaySaoPaulo: toDateInputValueSaoPaulo(),
    categoryNames,
    accountNames: origins.accountNames,
    cardNames: origins.cardNames,
  };
}

/**
 * Lançamento livre (docs/30-TELEGRAM.md, "Parsing por IA") — híbrido: tenta
 * o Gemini primeiro (data relativa, categoria e origem por nome real);
 * IA indisponível/erro/timeout/JSON inválido (`null`) → fallback pro
 * resultado do parser regex já calculado em `route.ts` (`fallbackCommand`):
 * `create_transaction` vira o lançamento de sempre (hoje + pago), `unknown`
 * vira a resposta de "não entendi".
 */
async function handleFreeformEntry(
  userId: string,
  rawText: string,
  fallbackCommand: Extract<ParsedCommand, { kind: "create_transaction" | "unknown" }>,
): Promise<CommandResult> {
  const ctx = await buildAiContext(userId);
  const ai = await parseTransactionWithAI(rawText, ctx);

  if (ai === null) {
    return fallbackCommand.kind === "create_transaction"
      ? handleCreateTransaction(userId, fallbackCommand)
      : { text: buildUnknownReply(), resultCode: "unknown_message" };
  }

  if (!ai.isTransaction) {
    return { text: buildUnknownReply(), resultCode: "unknown_message" };
  }

  return handleAiTransaction(userId, ai);
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
 *
 * `rawText` só é usado no caminho de lançamento livre (`create_transaction`/
 * `unknown` — docs/30-TELEGRAM.md, "Parsing por IA"); os comandos
 * determinísticos (saldo/hoje/gastos mes) nunca chamam a IA.
 */
async function executeCommand(userId: string, command: ParsedCommand, rawText: string): Promise<CommandResult> {
  try {
    switch (command.kind) {
      case "create_transaction":
      case "unknown":
        return await handleFreeformEntry(userId, rawText, command);
      case "query_balance":
        return await handleQueryBalance(userId);
      case "query_month_expenses":
        return await handleQueryMonthExpenses(userId);
      case "query_today":
        return await handleQueryToday(userId);
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
