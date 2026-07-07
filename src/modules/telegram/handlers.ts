import { Prisma } from "@/generated/prisma/client";
import { transactionService } from "@/modules/transactions/service";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { accountService } from "@/modules/accounts/service";
import { AccountDomainError } from "@/modules/accounts/errors";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { parseTransactionWithAI } from "./ai-parser";
import { draftFromAi, handlePendingReply, processDraft } from "./draft";
import { telegramPendingRepository } from "./pending";
import { listCategoryNamesForAI, listOriginNamesForAI, originPayload, resolveCategoryId, resolveOrigin } from "./resolve";
import { resolveTelegramTagId } from "./telegram-tag";
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

/**
 * Regra 2/3 (docs/30-TELEGRAM.md): categoria nunca fica nula, data default =
 * agora. Origem default = `resolveOrigin` sem kind/name (mesma conta ativa
 * mais antiga de sempre, ver resolve.ts) — caminho SEM fluxo de pergunta
 * (usado tanto pro lançamento rápido regex quanto pro fallback quando a IA
 * falha/está indisponível, docs/30-TELEGRAM.md "A IA nunca pode derrubar o
 * bot"). Toda transação criada pelo bot leva a tag "Telegram" (find-or-create,
 * requisito do dono — nunca afeta transações da UI web).
 */
async function handleCreateTransaction(
  userId: string,
  command: Extract<ParsedCommand, { kind: "create_transaction" }>,
): Promise<CommandResult> {
  const [category, origin, telegramTagId] = await Promise.all([
    resolveCategoryId(userId, command.type, command.keywordCandidates),
    resolveOrigin(userId, null, null),
    resolveTelegramTagId(userId),
  ]);

  const parsed = createTransactionSchema.safeParse({
    description: command.description,
    amount: command.amount,
    type: command.type,
    categoryId: category.id,
    ...originPayload(origin),
    tagIds: [telegramTagId],
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
 * vira a resposta de "não entendi". Esse fallback NUNCA entra no fluxo de
 * pergunta (`draft.ts`) — só o caminho de sucesso da IA exige valor + origem
 * resolvíveis (docs/30-TELEGRAM.md, "A IA nunca pode derrubar o bot").
 *
 * Se já existe um pending em aberto pro usuário (docs/30-TELEGRAM.md, "Fluxo
 * conversacional"), a mensagem é tratada como RESPOSTA a ele — nunca como um
 * lançamento novo, mesmo que pareça um (`handlePendingReply`, draft.ts).
 */
async function handleFreeformEntry(
  userId: string,
  rawText: string,
  fallbackCommand: Extract<ParsedCommand, { kind: "create_transaction" | "unknown" }>,
): Promise<CommandResult> {
  const pending = await telegramPendingRepository.getActive(userId);
  if (pending) return handlePendingReply(userId, pending, rawText);

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

  return processDraft(userId, draftFromAi(ai), 0);
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
