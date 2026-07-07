import { accountService } from "@/modules/accounts/service";
import { cardService } from "@/modules/cards/service";
import { normalizeWord } from "./normalize";
import { expectedOriginKind } from "./resolve";
import type { TelegramDraft, TelegramMissingField, TelegramPaymentMethod } from "./types";

/**
 * Merge de resposta a um pending (docs/30-TELEGRAM.md, "Fluxo conversacional")
 * — DETERMINÍSTICO de propósito, sem chamar a IA de novo: a resposta é curta
 * e o vocabulário (canal de pagamento + nome de conta/cartão real) é fixo,
 * chamar o Gemini só pra isso adicionaria latência/custo sem ganho real (rule
 * 02-dry-kiss-yagni, KISS).
 */

/** Reconhece o valor numérico numa resposta curta (ex.: "30", "foi 30", "R$ 30,50") — mais tolerante que o parser regex de mensagem completa (`parser.ts`, AMOUNT_PATTERN): aqui o número pode estar em QUALQUER posição da frase, não precisa ser um token isolado. */
const AMOUNT_IN_TEXT_PATTERN = /\d+(?:[.,]\d{1,2})?/;

function extractAmountFromReply(text: string): string | null {
  const match = AMOUNT_IN_TEXT_PATTERN.exec(text);
  return match ? match[0].replace(",", ".") : null;
}

/** Vocabulário fixo de canal de pagamento numa resposta curta — mesma granularidade do prompt da IA (`ai-parser.ts`), reconhecido aqui por palavra-chave direta. */
const PAYMENT_METHOD_KEYWORDS: Record<string, TelegramPaymentMethod> = {
  credito: "credit",
  debito: "debit",
  pix: "pix",
  transferencia: "transfer",
  ted: "transfer",
  doc: "transfer",
  dinheiro: "cash",
  especie: "cash",
  cash: "cash",
};

function extractPaymentMethodFromReply(text: string): TelegramPaymentMethod | null {
  const tokens = text.split(/\s+/).map(normalizeWord);
  for (const token of tokens) {
    const method = PAYMENT_METHOD_KEYWORDS[token];
    if (method) return method;
  }
  return null;
}

/** Nome de conta/cartão ATIVO citado na resposta — bate como SUBSTRING do texto normalizado (resposta curta tipo "pix nubank" não repete o nome como token isolado igual ao cadastro, mas contém o trecho). */
async function extractOriginNameFromReply(
  userId: string,
  text: string,
  wantKind: ReturnType<typeof expectedOriginKind>,
): Promise<string | null> {
  const normalizedText = normalizeWord(text);

  if (wantKind === "card" || wantKind === null) {
    const cards = await cardService.listCards(userId);
    const match = cards.find((card) => card.isActive && normalizedText.includes(normalizeWord(card.name)));
    if (match) return match.name;
  }

  if (wantKind === "account" || wantKind === null) {
    const accounts = await accountService.listWithBalances(userId);
    const match = accounts.find(
      (account) => account.isActive && normalizedText.includes(normalizeWord(account.name)),
    );
    if (match) return match.name;
  }

  return null;
}

/** "cancelar" (case/acento-insensível) — único comando reconhecido pra abortar um pending em progresso. */
export function isCancelCommand(text: string): boolean {
  return normalizeWord(text) === "cancelar";
}

/**
 * Mescla a resposta do usuário no draft pendente, de acordo com o campo que
 * faltava. Resposta que não traz nada reconhecível devolve o draft
 * inalterado — `processDraft` (draft.ts) volta a perguntar (ou desiste, após
 * ~3 rodadas).
 */
export async function mergeReplyIntoDraft(
  userId: string,
  draft: TelegramDraft,
  missingField: TelegramMissingField,
  replyText: string,
): Promise<TelegramDraft> {
  if (missingField === "amount") {
    const amount = extractAmountFromReply(replyText);
    return amount ? { ...draft, amount } : draft;
  }

  const paymentMethod = extractPaymentMethodFromReply(replyText) ?? draft.paymentMethod;
  const wantKind = expectedOriginKind(paymentMethod);
  const originName = await extractOriginNameFromReply(userId, replyText, wantKind);

  if (!originName) return { ...draft, paymentMethod };

  return { ...draft, paymentMethod, originKind: wantKind, originName };
}
