import { Prisma } from "@/generated/prisma/client";
import { transactionService } from "@/modules/transactions/service";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { accountService } from "@/modules/accounts/service";
import { AccountDomainError } from "@/modules/accounts/errors";
import { reportService } from "@/modules/reports/service";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { parseTransactionFromImage, parseTransactionFromVoice, parseTransactionWithAI } from "./ai-parser";
import { parseFinancingFromDocument } from "./financing-parser";
import { draftFromAi, handlePendingReply, processDraft } from "./draft";
import { telegramPendingRepository } from "./pending";
import { normalizeWord } from "./normalize";
import {
  listCategoryNamesForAI,
  listInvestmentNamesForAI,
  listKnownMerchantsForAI,
  listOriginNamesForAI,
  originPayload,
  resolveCategoryId,
  resolveOrigin,
} from "./resolve";
import { executeTelegramQuery, resolvePeriodRange } from "./query";
import { handleInvestContribution } from "./invest";
import { resolveTelegramTagId } from "./telegram-tag";
import {
  buildBalanceReply,
  buildDocumentUnreadableReply,
  buildDocumentUnsupportedReply,
  buildErrorReply,
  buildFinancingSummaryReply,
  buildImageUnreadableReply,
  buildMonthExpensesReply,
  buildQueryReply,
  buildTodaySummaryReply,
  buildTransactionConfirmationReply,
  buildUnknownReply,
  buildVoiceUnreadableReply,
} from "./reply";
import { TelegramDomainError } from "./errors";
import type { CommandResult, ParsedCommand, TelegramIntent } from "./types";

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
    resolveCategoryId(userId, command.type, command.keywordCandidates, command.description),
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

/**
 * Insumo do prompt da IA — categorias/contas/cartões reais do usuário +
 * merchants conhecidos (descrição → categoria dominante, docs/30-TELEGRAM.md,
 * "Parsing por IA") + "hoje" em SP.
 */
async function buildAiContext(userId: string) {
  const [categoryNames, origins, knownMerchants, investmentNames] = await Promise.all([
    listCategoryNamesForAI(userId),
    listOriginNamesForAI(userId),
    listKnownMerchantsForAI(userId),
    listInvestmentNamesForAI(userId),
  ]);

  return {
    todaySaoPaulo: toDateInputValueSaoPaulo(),
    categoryNames,
    accountNames: origins.accountNames,
    cardNames: origins.cardNames,
    investmentNames,
    knownMerchants,
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
 *
 * `intent="query"` (docs/30-TELEGRAM.md, "Consulta por IA") desvia pro
 * executor de consulta (`query.ts`) ANTES de qualquer coisa do fluxo de
 * lançamento — nunca abre pending, nunca vira `create_transaction`. `intent`
 * ausente (resposta antiga/sem classificação) cai no default de sempre
 * (`isTransaction` decide register vs. unknown), zero regressão pro
 * comportamento pré-existente.
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

  const intent: TelegramIntent = ai.intent ?? (ai.isTransaction ? "register" : "unknown");

  if (intent === "query") {
    if (!ai.query) return { text: buildUnknownReply(), resultCode: "unknown_message" };
    const result = await executeTelegramQuery(userId, ai.query);
    return { text: buildQueryReply(result), resultCode: `query_${result.kind}` };
  }

  if (intent === "invest") {
    if (!ai.invest) return { text: buildUnknownReply(), resultCode: "unknown_message" };
    return handleInvestContribution(userId, ai.invest);
  }

  if (!ai.isTransaction) {
    return { text: buildUnknownReply(), resultCode: "unknown_message" };
  }

  return processDraft(userId, draftFromAi(ai), 0);
}

/**
 * Lançamento via FOTO (docs/30-TELEGRAM.md, bot aceita foto de nota/
 * comprovante/notificação — extração por Gemini vision). A partir do momento
 * em que a IA reconhece um lançamento na imagem, cai no MESMO fluxo
 * conversacional do texto (`processDraft`, draft.ts): confirma origem
 * ambígua (ex.: notificação só cita "cartão final 7547", sem nome real de
 * cartão — vira pergunta, nunca um chute), aplica a tag "Telegram", cria a
 * transação.
 *
 * DIFERENTE do texto, não existe fallback determinístico pra foto (não dá
 * pra "regex" uma imagem) — sem `GEMINI_API_KEY`, erro/timeout na chamada,
 * imagem sem nenhum lançamento reconhecível (`isTransaction=false`) ou sem
 * valor legível (`amount=null`), responde pedindo pra reenviar a foto (mais
 * nítida) ou digitar em texto, sem abrir um pending — não há nada de
 * concreto pra perguntar sobre nesses casos.
 *
 * Não verifica pending em aberto (diferente de `handleFreeformEntry`): uma
 * foto nunca é tratada como resposta textual a uma pergunta anterior (fora de
 * escopo desta versão — ver Improvement Suggestions no relatório).
 *
 * Se a legenda casar com conta/cartão real e a IA não preencheu origem,
 * `enrichAiOriginFromCaption` completa origin/paymentMethod de forma
 * determinística (legenda "Crédito pessoal" = cartão, não categoria).
 */
function enrichAiOriginFromCaption(
  ai: NonNullable<Awaited<ReturnType<typeof parseTransactionFromImage>>>,
  caption: string | null,
  accountNames: string[],
  cardNames: string[],
): typeof ai {
  if (!caption || ai.originName) return ai;

  const captionNorm = normalizeWord(caption);
  const cardMatch = cardNames.find((name) => normalizeWord(name) === captionNorm);
  if (cardMatch) {
    return {
      ...ai,
      originKind: "card",
      originName: cardMatch,
      paymentMethod: ai.paymentMethod ?? "credit",
      // Legenda era nome de cartão — não deve virar categoria.
      categoryName:
        ai.categoryName && normalizeWord(ai.categoryName) === captionNorm ? null : ai.categoryName,
    };
  }

  const accountMatch = accountNames.find((name) => normalizeWord(name) === captionNorm);
  if (accountMatch) {
    return {
      ...ai,
      originKind: "account",
      originName: accountMatch,
      paymentMethod: ai.paymentMethod ?? "pix",
      categoryName:
        ai.categoryName && normalizeWord(ai.categoryName) === captionNorm ? null : ai.categoryName,
    };
  }

  return ai;
}

export async function handleImageEntry(
  userId: string,
  imageBytes: Buffer,
  mimeType: string,
  caption: string | null,
): Promise<CommandResult> {
  const ctx = await buildAiContext(userId);
  const aiRaw = await parseTransactionFromImage(imageBytes, mimeType, caption, ctx);

  if (aiRaw === null) {
    return { text: buildImageUnreadableReply(), resultCode: "image_ai_null" };
  }
  if (!aiRaw.isTransaction || !aiRaw.amount) {
    return { text: buildImageUnreadableReply(), resultCode: "image_no_amount" };
  }

  const ai = enrichAiOriginFromCaption(aiRaw, caption, ctx.accountNames, ctx.cardNames);
  return processDraft(userId, draftFromAi(ai), 0);
}

/**
 * Nota de voz (docs/30-TELEGRAM.md) — Gemini entende OGG nativo; mesmo
 * fluxo de texto livre (intent register/query + processDraft + botões).
 * Sem fallback regex. Áudio já foi apagado do disco em `downloadVoice`.
 */
export async function handleVoiceEntry(
  userId: string,
  audioBytes: Buffer,
  mimeType: string,
): Promise<CommandResult> {
  const pending = await telegramPendingRepository.getActive(userId);
  // Voz com pending aberto: não trata como resposta textual — pede digitar.
  if (pending) {
    return {
      text: buildVoiceUnreadableReply(),
      resultCode: "voice_pending_open",
    };
  }

  const ctx = await buildAiContext(userId);
  const ai = await parseTransactionFromVoice(audioBytes, mimeType, ctx);

  if (ai === null) {
    return { text: buildVoiceUnreadableReply(), resultCode: "voice_ai_null" };
  }

  const intent: TelegramIntent = ai.intent ?? (ai.isTransaction ? "register" : "unknown");

  if (intent === "query") {
    if (!ai.query) return { text: buildUnknownReply(), resultCode: "unknown_message" };
    const result = await executeTelegramQuery(userId, ai.query);
    return { text: buildQueryReply(result), resultCode: `query_${result.kind}` };
  }

  if (intent === "invest") {
    if (!ai.invest) return { text: buildUnknownReply(), resultCode: "unknown_message" };
    return handleInvestContribution(userId, ai.invest);
  }

  if (!ai.isTransaction) {
    return { text: buildUnknownReply(), resultCode: "unknown_message" };
  }

  return processDraft(userId, draftFromAi(ai), 0);
}

/** MimeTypes que `parseFinancingFromDocument` (Gemini) sabe ler — PDF ou foto do contrato/CCB (docs/30-TELEGRAM.md, ingestão por documento). */
const SUPPORTED_FINANCING_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

/**
 * Ingestão de DOCUMENTO de financiamento (PDF ou foto do contrato/CCB,
 * docs/30-TELEGRAM.md — extração por Gemini, `financing-parser.ts`). SÓ
 * parse + resposta — NUNCA cria o `Loan` aqui: o cadastro real (conta, asset,
 * link das parcelas existentes) acontece no app, onde há contexto pra revisar
 * o que o Gemini leu antes de persistir.
 *
 * `mimeType` fora de PDF/imagem (`SUPPORTED_FINANCING_DOCUMENT_MIME_TYPES`)
 * nunca chega no Gemini — resposta amigável direto. Parser retornando `null`
 * (Gemini indisponível, timeout, shape não reconhecível) tem a MESMA garantia
 * de `handleImageEntry`: nunca derruba o webhook, sempre uma resposta pra
 * reenviar. `userId` recebido só por simetria com os demais handlers
 * (`executeCommand`/`handleImageEntry`) — não é usado neste caminho (sem
 * criação de registro), mas mantém a mesma assinatura do módulo.
 */
export async function handleDocumentEntry(
  userId: string,
  documentBytes: Buffer,
  mimeType: string,
): Promise<CommandResult> {
  if (!SUPPORTED_FINANCING_DOCUMENT_MIME_TYPES.has(mimeType)) {
    return { text: buildDocumentUnsupportedReply(), resultCode: "document_unsupported_type" };
  }

  const parsed = await parseFinancingFromDocument(documentBytes, mimeType);
  const summary = parsed ? buildFinancingSummaryReply(parsed) : null;

  if (summary === null) {
    return { text: buildDocumentUnreadableReply(), resultCode: "document_unreadable" };
  }

  return { text: summary, resultCode: "financing_parsed" };
}

async function handleQueryBalance(userId: string): Promise<CommandResult> {
  const total = await accountService.totalBalance(userId);
  return { text: buildBalanceReply(total.toString()), resultCode: "balance_queried" };
}

/**
 * "gastos mes" — MESMA base de fluxo de caixa das consultas por IA
 * (`reportService.categoryTotals` via o range de `resolvePeriodRange`,
 * query.ts): só conta (`cardId IS NULL`), `COALESCE(paidAt, date)`, paga, sem
 * transferência. O total exibido é a soma das próprias linhas — a resposta
 * fecha internamente E bate com o "quanto gastei esse mês" da IA (era o bug:
 * este comando usava `expensesByCategory`, base accrual+cartão).
 */
async function handleQueryMonthExpenses(userId: string): Promise<CommandResult> {
  const { dateFrom, dateTo } = resolvePeriodRange("this_month");
  const categories = await reportService.categoryTotals(userId, dateFrom, dateTo);
  const total = categories.reduce((sum, category) => sum.plus(category.total), new Prisma.Decimal(0));

  return {
    text: buildMonthExpensesReply(
      categories.map((category) => ({ name: category.categoryName, total: category.total.toString() })),
      total.toString(),
    ),
    resultCode: "month_expenses_queried",
  };
}

/**
 * "hoje" — gastos de hoje pela MESMA base de fluxo de caixa de todo o resto
 * (`reportService.cashflow` com dateFrom=dateTo=meia-noite SP de hoje; o
 * service estende até o fim do dia, ver `endOfDayInclusive`). Era o bug de
 * contar o que não devia: o `transactionService.list({ type: EXPENSE })` cru
 * incluía perna de transferência, compra no cartão e despesa não paga —
 * transferir R$1000 entre contas respondia "gastou R$1000 hoje".
 */
async function handleQueryToday(userId: string): Promise<CommandResult> {
  const now = nowInSaoPaulo();
  const todayMidnight = parseInSaoPaulo(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

  const { expense } = await reportService.cashflow(userId, todayMidnight, todayMidnight);

  return { text: buildTodaySummaryReply(expense.toString()), resultCode: "today_summary_queried" };
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

export const telegramHandlers = {
  executeCommand,
  handleImageEntry,
  handleVoiceEntry,
  handleDocumentEntry,
};
