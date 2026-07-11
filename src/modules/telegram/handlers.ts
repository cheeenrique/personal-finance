import { Prisma } from "@/generated/prisma/client";
import { TransactionDomainError } from "@/modules/transactions/errors";
import { accountService } from "@/modules/accounts/service";
import { AccountDomainError } from "@/modules/accounts/errors";
import { reportService } from "@/modules/reports/service";
import { nowInSaoPaulo, parseInSaoPaulo } from "@/lib/date/timezone";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { parseTransactionFromImage, parseTransactionFromVoice, parseTransactionWithAI } from "./ai-parser";
import { parseFinancingFromDocument } from "./financing-parser";
import { createBotTransaction } from "./create";
import { draftFromAi, handlePendingReply, processDraft } from "./draft";
import { telegramPendingRepository } from "./pending";
import { normalizeWord } from "./normalize";
import {
  listCategoryNamesForAI,
  listInvestmentNamesForAI,
  listKnownMerchantsForAI,
  listOriginNamesForAI,
  resolveCategoryByName,
  resolveCategoryId,
  resolveOrigin,
} from "./resolve";
import { executeTelegramQuery, resolvePeriodRange } from "./query";
import { handleInvestContribution } from "./invest";
import {
  buildBalanceReply,
  buildDocumentUnreadableReply,
  buildDocumentUnsupportedReply,
  buildErrorReply,
  buildFinancingSummaryReply,
  buildImageUnreadableReply,
  buildMonthExpensesReply,
  buildMultiTransactionReply,
  buildQueryReply,
  buildTodaySummaryReply,
  buildTransactionConfirmationReply,
  buildUnknownReply,
  buildVoicePendingOpenReply,
  buildVoiceUnreadableReply,
} from "./reply";
import { TelegramDomainError } from "./errors";
import type { AiParsedTransaction, CommandResult, ParsedCommand, TelegramIntent } from "./types";

function isKnownDomainError(error: unknown): error is Error {
  return (
    error instanceof TelegramDomainError ||
    error instanceof TransactionDomainError ||
    error instanceof AccountDomainError
  );
}

/**
 * Regra 2/3 (docs/30-TELEGRAM.md): categoria nunca fica nula, data default =
 * hoje. Origem default = `resolveOrigin` sem kind/name (mesma conta ativa
 * mais antiga de sempre, ver resolve.ts) — caminho SEM fluxo de pergunta
 * (usado tanto pro lançamento rápido regex quanto pro fallback quando a IA
 * falha/está indisponível, docs/30-TELEGRAM.md "A IA nunca pode derrubar o
 * bot"). Data = hoje sempre → `createBotTransaction` sempre cria pago (mesmo
 * comportamento de antes). Montagem do schema + tag "Telegram" + regra de
 * `isPaid`: núcleo compartilhado com `draft.ts` (ver `create.ts`). Sem
 * teclado pós-save nesta versão (docs/30-TELEGRAM.md, "Botões inline").
 */
async function handleCreateTransaction(
  userId: string,
  command: Extract<ParsedCommand, { kind: "create_transaction" }>,
): Promise<CommandResult> {
  const [category, origin] = await Promise.all([
    resolveCategoryId(userId, command.type, command.keywordCandidates, command.description),
    resolveOrigin(userId, null, null),
  ]);

  const result = await createBotTransaction(userId, {
    type: command.type,
    amount: command.amount,
    description: command.description,
    date: toDateInputValueSaoPaulo(),
    category,
    origin,
  });

  if (!result.success) {
    return { text: buildErrorReply(result.message), resultCode: "validation_error" };
  }

  return {
    text: buildTransactionConfirmationReply({
      type: command.type,
      description: command.description,
      amount: command.amount,
      categoryName: category.name,
      originLabel: origin.label,
      date: result.created.date,
      isPaid: result.created.isPaid,
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
 * comprovante/notificação — extração pela camada de IA nova, VLM NVIDIA com
 * fallback Gemini). A imagem pode conter 1 OU VÁRIOS lançamentos (ex.: print
 * de UMA notificação de compra vs. print com VÁRIAS empilhadas) —
 * `parseTransactionFromImage` sempre devolve um array (`[]` quando não há
 * nenhum lançamento legível).
 *
 * **1 lançamento** — MESMO fluxo conversacional do texto (`processDraft`,
 * draft.ts): confirma origem ambígua (ex.: notificação só cita "cartão final
 * 7547", sem nome real de cartão — vira pergunta, nunca um chute), aplica a
 * tag "Telegram", cria a transação com botões pós-save.
 *
 * **N lançamentos (N>1)** — cria TODOS direto, sem fluxo de pergunta por item
 * (UX ruim pra várias perguntas em sequência numa foto só): categoria por
 * histórico/nome (`resolveCategoryByName`) e origem DEFAULT quando a IA não
 * identificou uma real (`resolveOrigin`, mesmo fallback do lançamento rápido
 * regex) — ver `handleMultipleImageTransactions`. Resposta combinada, sem
 * teclado por item nesta versão.
 *
 * DIFERENTE do texto, não existe fallback determinístico pra foto (não dá
 * pra "regex" uma imagem) — array vazio (sem `NVIDIA_API_KEY`/`GEMINI_API_KEY`,
 * erro/timeout na chamada, imagem sem nenhum lançamento reconhecível ou sem
 * valor legível em nenhum item) responde pedindo pra reenviar a foto (mais
 * nítida) ou digitar em texto, sem abrir um pending — não há nada de
 * concreto pra perguntar sobre nesses casos.
 *
 * Não verifica pending em aberto (diferente de `handleFreeformEntry`): uma
 * foto nunca é tratada como resposta textual a uma pergunta anterior (fora de
 * escopo desta versão — ver Improvement Suggestions no relatório).
 *
 * Se a legenda casar com conta/cartão real e a IA não preencheu origem,
 * `enrichAiOriginFromCaption` completa origin/paymentMethod de forma
 * determinística (legenda "Crédito pessoal" = cartão, não categoria) — só se
 * aplica ao caminho de 1 lançamento (fluxo conversacional).
 */
function enrichAiOriginFromCaption(
  ai: AiParsedTransaction,
  caption: string | null,
  accountNames: string[],
  cardNames: string[],
): AiParsedTransaction {
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

/** Item com `amount` legível — filtra os que a IA não conseguiu extrair valor (imagem parcialmente ilegível). */
function hasReadableAmount(item: AiParsedTransaction): item is AiParsedTransaction & { amount: string } {
  return Boolean(item.amount);
}

/**
 * Cria 1 transação a partir de um item de imagem MULTI-lançamento — mesmo
 * núcleo de montagem (`createBotTransaction`) do resto do bot, resolução de
 * categoria/origem SEM fluxo de pergunta (docs/30-TELEGRAM.md, Regra 2:
 * categoria sempre sugerida, nunca bloqueia; `resolveOrigin` cai na conta
 * ativa default quando a IA não identificou uma origem real, mesma regra do
 * fallback regex — `handleCreateTransaction` acima). `null` quando a criação
 * falha (erro de validação isolado nesse item) — descartado da lista final
 * pelo caller, nunca derruba os demais itens da mesma imagem.
 */
async function createImageBatchItem(
  userId: string,
  item: AiParsedTransaction & { amount: string },
): Promise<{ description: string; amount: string } | null> {
  const keywordCandidates = [item.categoryName, item.description].filter((value): value is string =>
    Boolean(value),
  );

  const [category, origin] = await Promise.all([
    resolveCategoryByName(userId, item.type, item.categoryName, item.description, keywordCandidates),
    resolveOrigin(userId, item.originKind, item.originName),
  ]);

  const result = await createBotTransaction(userId, {
    type: item.type,
    amount: item.amount,
    description: item.description,
    date: item.date ?? toDateInputValueSaoPaulo(),
    category,
    origin,
  });

  if (!result.success) return null;
  return { description: result.created.description, amount: result.created.amount.toString() };
}

/**
 * Imagem com MAIS de 1 lançamento reconhecido — cria TODOS em paralelo e
 * responde com um resumo combinado (`buildMultiTransactionReply`). Item que
 * falhar na criação é silenciosamente descartado da lista (erro isolado, não
 * derruba os demais); se TODOS falharem, responde erro genérico em vez de uma
 * confirmação vazia.
 */
async function handleMultipleImageTransactions(
  userId: string,
  items: Array<AiParsedTransaction & { amount: string }>,
): Promise<CommandResult> {
  const results = await Promise.all(items.map((item) => createImageBatchItem(userId, item)));
  const created = results.filter((item): item is { description: string; amount: string } => item !== null);

  if (created.length === 0) {
    return {
      text: buildErrorReply("Não foi possível cadastrar os lançamentos dessa imagem."),
      resultCode: "image_multi_all_failed",
    };
  }

  const total = created.reduce((sum, item) => sum.plus(item.amount), new Prisma.Decimal(0));

  return {
    text: buildMultiTransactionReply(created, total.toString()),
    resultCode: "image_multi_created",
  };
}

export async function handleImageEntry(
  userId: string,
  imageBytes: Buffer,
  mimeType: string,
  caption: string | null,
): Promise<CommandResult> {
  const ctx = await buildAiContext(userId);
  const items = await parseTransactionFromImage(imageBytes, mimeType, caption, ctx);
  const validItems = items.filter(hasReadableAmount);

  if (validItems.length === 0) {
    return { text: buildImageUnreadableReply(), resultCode: "image_unreadable" };
  }

  if (validItems.length === 1) {
    const ai = enrichAiOriginFromCaption(validItems[0], caption, ctx.accountNames, ctx.cardNames);
    return processDraft(userId, draftFromAi(ai), 0);
  }

  return handleMultipleImageTransactions(userId, validItems);
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
  // Voz com pending aberto: não trata como resposta textual — pede pra
  // resolver a pergunta em aberto primeiro (mensagem honesta, docs/30-TELEGRAM.md).
  if (pending) {
    return {
      text: buildVoicePendingOpenReply(),
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
