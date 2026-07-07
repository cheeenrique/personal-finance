import { normalizeWord } from "./normalize";
import type { TelegramDraft, TelegramMissingField, TelegramPaymentMethod } from "./types";

/**
 * Merge de resposta a um pending (docs/30-TELEGRAM.md, "Fluxo conversacional")
 * — DETERMINÍSTICO de propósito, sem chamar a IA de novo: a resposta é curta
 * e o vocabulário (canal de pagamento) é fixo, chamar o Gemini só pra isso
 * adicionaria latência/custo sem ganho real (rule 02-dry-kiss-yagni, KISS).
 * Não casa nome de conta/cartão contra o banco aqui — só extrai texto/canal;
 * quem resolve contra conta/cartão REAL (strip de palavra de método + match
 * por contém + ambiguidade) é `resolveOriginStrict` (`resolve.ts`), fonte
 * única dessa lógica (DRY).
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

/**
 * Texto candidato a origem citado na resposta — SEM tentar casar contra
 * conta/cartão real aqui (docs/30-TELEGRAM.md, bug fix "origem faz loop"):
 * essa parte, incluindo strip de palavra de método/ligação + match por
 * contém + ambiguidade, é responsabilidade ÚNICA de `resolveOriginStrict`
 * (`resolve.ts`) — evita duplicar a mesma lógica de matching em 2 lugares
 * (DRY). Aqui só filtra resposta vazia.
 */
function extractOriginTextFromReply(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed : null;
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
export function mergeReplyIntoDraft(
  draft: TelegramDraft,
  missingField: TelegramMissingField,
  replyText: string,
): TelegramDraft {
  if (missingField === "amount") {
    const amount = extractAmountFromReply(replyText);
    return amount ? { ...draft, amount } : draft;
  }

  const paymentMethod = extractPaymentMethodFromReply(replyText) ?? draft.paymentMethod;
  const originName = extractOriginTextFromReply(replyText);

  if (!originName) return { ...draft, paymentMethod };

  return { ...draft, paymentMethod, originName };
}
