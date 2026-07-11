import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { transactionService } from "@/modules/transactions/service";
import { buildPendingOriginKeyboard, buildPostSaveKeyboard } from "./inline-keyboard";
import { isCancelCommand, mergeReplyIntoDraft } from "./pending-merge";
import { telegramPendingRepository, type PendingEntry } from "./pending";
import {
  expectedOriginKind,
  listActiveOriginsForButtons,
  originPayload,
  resolveCategoryByName,
  resolveOriginStrict,
} from "./resolve";
import { resolveTelegramTagId } from "./telegram-tag";
import {
  buildAskAmountReply,
  buildAskOriginAmbiguousReply,
  buildAskOriginReply,
  buildErrorReply,
  buildPendingCancelledReply,
  buildPendingGaveUpReply,
  buildTransactionConfirmationReply,
} from "./reply";
import type {
  AiParsedTransaction,
  CommandResult,
  TelegramDraft,
  TelegramOrigin,
  TelegramOriginKind,
} from "./types";

/**
 * Rodadas máximas de pergunta antes de desistir (docs/30-TELEGRAM.md, "Fluxo
 * conversacional") — depois disso, pede pro usuário reenviar a mensagem
 * completa em vez de ficar perguntando pra sempre.
 */
const MAX_PENDING_ATTEMPTS = 3;

/** Saída da IA vira um draft — chamador (`handlers.ts`) só invoca isto depois de já checar `ai.isTransaction === true`. */
export function draftFromAi(ai: AiParsedTransaction): TelegramDraft {
  return {
    type: ai.type,
    amount: ai.amount,
    description: ai.description,
    date: ai.date,
    categoryName: ai.categoryName,
    paymentMethod: ai.paymentMethod,
    originKind: ai.originKind,
    originName: ai.originName,
  };
}

/**
 * Callback de pending origem escolheu conta/cartão por id — preenche
 * originKind/originName com o NOME cadastrado (não o id), pra
 * `resolveOriginStrict` casar no fluxo normal. Caller já resolveu o nome.
 */
export function draftFromOriginIds(
  draft: TelegramDraft,
  kind: TelegramOriginKind,
  originName: string,
): TelegramDraft {
  return {
    ...draft,
    originKind: kind,
    originName,
    paymentMethod: draft.paymentMethod ?? (kind === "card" ? "credit" : null),
  };
}

type DraftResolution =
  | { complete: true; category: { id: string; name: string }; origin: TelegramOrigin }
  | { complete: false; missing: "amount" }
  | { complete: false; missing: "origin"; ambiguousLabels?: string[] };

/**
 * Campos OBRIGATÓRIOS do lançamento via IA (docs/30-TELEGRAM.md, "Fluxo
 * conversacional"): valor + origem resolvível (conta OU cartão real do
 * usuário, conforme `paymentMethod` — `resolveOriginStrict`). Categoria NUNCA
 * bloqueia — sempre cai no histórico por descrição, depois no fallback
 * "Outros"/"Outros (Receita)" (`resolveCategoryByName`, mesma regra do
 * parser regex).
 */
async function resolveDraft(userId: string, draft: TelegramDraft): Promise<DraftResolution> {
  if (!draft.amount || !positiveDecimalSchema.safeParse(draft.amount).success) {
    return { complete: false, missing: "amount" };
  }

  const keywordCandidates = [draft.categoryName, draft.description].filter((value): value is string =>
    Boolean(value),
  );

  const [category, originResult] = await Promise.all([
    resolveCategoryByName(userId, draft.type, draft.categoryName, draft.description, keywordCandidates),
    resolveOriginStrict(userId, draft.paymentMethod, draft.originKind, draft.originName),
  ]);

  if (originResult.status === "resolved") {
    return { complete: true, category, origin: originResult.origin };
  }

  if (originResult.status === "ambiguous") {
    return {
      complete: false,
      missing: "origin",
      ambiguousLabels: originResult.candidates.map((candidate) => candidate.label),
    };
  }

  return { complete: false, missing: "origin" };
}

/**
 * Cria a transação a partir de um draft já completo. Regra determinística de
 * `isPaid` (docs/30-TELEGRAM.md): data resolvida > hoje (America/Sao_Paulo) =
 * previsto, senão pago — nunca decidida pela IA. Toda transação criada pelo
 * bot leva a tag "Telegram" (find-or-create, `telegram-tag.ts` — requisito do
 * dono, nunca afeta transações criadas pela UI web).
 */
async function createTransactionFromDraft(
  userId: string,
  draft: TelegramDraft,
  category: { id: string; name: string },
  origin: TelegramOrigin,
): Promise<CommandResult> {
  const today = toDateInputValueSaoPaulo();
  const dateStr = draft.date ?? today;
  const isPaid = dateStr <= today;
  const telegramTagId = await resolveTelegramTagId(userId);

  const parsed = createTransactionSchema.safeParse({
    description: draft.description,
    amount: draft.amount,
    type: draft.type,
    categoryId: category.id,
    ...originPayload(origin),
    date: dateStr,
    isPaid,
    tagIds: [telegramTagId],
  });

  // Limpa o pending ANTES de qualquer early-return — completo ou inválido, o
  // rascunho em progresso não deve sobreviver a este ponto (evita re-perguntar
  // um draft que já tentamos finalizar). Se `createTransaction` falhar
  // abaixo, o pending já foi perdido — mas isso não duplica nada: o dedup por
  // `update_id` (route.ts, `modules/telegram/dedup.ts`) já garante que um
  // retry do Telegram é descartado antes de chegar aqui.
  await telegramPendingRepository.remove(userId);

  if (!parsed.success) {
    return {
      text: buildErrorReply(parsed.error.issues[0]?.message ?? "Dados inválidos."),
      resultCode: "validation_error",
    };
  }

  const created = await transactionService.createTransaction(userId, parsed.data);

  return {
    text: buildTransactionConfirmationReply({
      type: draft.type,
      description: draft.description,
      amount: draft.amount ?? "0",
      categoryName: category.name,
      originLabel: origin.label,
      date: created.date,
      isPaid: created.isPaid,
    }),
    resultCode: "transaction_created",
    replyMarkup: buildPostSaveKeyboard(created.id),
  };
}

/**
 * Processa um draft (novo ou já mesclado de uma resposta) — completo cria a
 * transação; incompleto salva/atualiza o pending e pergunta o que falta
 * (docs/30-TELEGRAM.md, "Fluxo conversacional"). `attempts` é o número de
 * PERGUNTAS já feitas até aqui (0 na 1ª tentativa, antes de qualquer
 * pergunta) — ao atingir `MAX_PENDING_ATTEMPTS`, desiste em vez de perguntar
 * de novo.
 */
export async function processDraft(userId: string, draft: TelegramDraft, attempts: number): Promise<CommandResult> {
  const resolution = await resolveDraft(userId, draft);

  if (resolution.complete) {
    return createTransactionFromDraft(userId, draft, resolution.category, resolution.origin);
  }

  if (attempts >= MAX_PENDING_ATTEMPTS) {
    await telegramPendingRepository.remove(userId);
    return { text: buildPendingGaveUpReply(), resultCode: "pending_gave_up" };
  }

  const nextAttempts = attempts + 1;
  await telegramPendingRepository.upsert(userId, draft, resolution.missing, nextAttempts);

  if (resolution.missing === "amount") {
    return { text: buildAskAmountReply(), resultCode: "pending_amount_asked" };
  }

  const wantKind = expectedOriginKind(draft.paymentMethod);
  const origins =
    resolution.ambiguousLabels && resolution.ambiguousLabels.length > 0
      ? (await listActiveOriginsForButtons(userId, wantKind)).filter((origin) =>
          resolution.ambiguousLabels!.includes(origin.label),
        )
      : await listActiveOriginsForButtons(userId, wantKind);

  const replyMarkup = origins.length > 0 ? buildPendingOriginKeyboard(origins) : undefined;

  if (resolution.ambiguousLabels && resolution.ambiguousLabels.length > 0) {
    return {
      text: buildAskOriginAmbiguousReply(resolution.ambiguousLabels),
      resultCode: "pending_origin_ambiguous",
      replyMarkup,
    };
  }

  return { text: buildAskOriginReply(), resultCode: "pending_origin_asked", replyMarkup };
}

/**
 * Trata uma mensagem como RESPOSTA a um pending em aberto (docs/30-TELEGRAM.md,
 * "Fluxo conversacional"): "cancelar" apaga o pending; qualquer outra coisa é
 * mesclada no draft (`mergeReplyIntoDraft`, determinístico) e reprocessada.
 */
export async function handlePendingReply(
  userId: string,
  pending: PendingEntry,
  rawText: string,
): Promise<CommandResult> {
  if (isCancelCommand(rawText)) {
    await telegramPendingRepository.remove(userId);
    return { text: buildPendingCancelledReply(), resultCode: "pending_cancelled" };
  }

  const merged = mergeReplyIntoDraft(pending.draft, pending.missingField, rawText);
  return processDraft(userId, merged, pending.attempts);
}
