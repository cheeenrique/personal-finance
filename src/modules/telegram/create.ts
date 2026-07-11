import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { createTransactionSchema } from "@/modules/transactions/schemas";
import { transactionService } from "@/modules/transactions/service";
import type { TransactionWithTags } from "@/modules/transactions/types";
import { originPayload } from "./resolve";
import { resolveTelegramTagId } from "./telegram-tag";
import type { TelegramOrigin, TelegramTransactionType } from "./types";

/**
 * Insumo já RESOLVIDO pelo caller (categoria/origem resolvidas — isso é
 * específico de cada caminho, ver `create.ts` abaixo). `date` é sempre uma
 * string `YYYY-MM-DD` já decidida pelo caller: o fallback regex passa "hoje"
 * (`toDateInputValueSaoPaulo()`); o caminho IA passa `draft.date ?? hoje`.
 */
export type CreateBotTransactionInput = {
  type: TelegramTransactionType;
  amount: string;
  description: string;
  date: string;
  category: { id: string; name: string };
  origin: TelegramOrigin;
};

export type CreateBotTransactionResult =
  | { success: true; created: TransactionWithTags }
  | { success: false; message: string };

/**
 * Núcleo ÚNICO de MONTAGEM + criação da transação do bot (docs/30-TELEGRAM.md)
 * — fonte de verdade compartilhada entre o fallback regex (`handlers.ts`,
 * `handleCreateTransaction`) e o caminho IA/foto/voz (`draft.ts`,
 * `createTransactionFromDraft`). Antes duplicado nos dois lugares (montagem
 * do `createTransactionSchema` + resolução da tag "Telegram" + regra de
 * `isPaid`), com risco de driftar — agora muda em 1 lugar só.
 *
 * NÃO resolve categoria/origem (isso é específico de cada caller: o fallback
 * usa origem default, o caminho IA usa `resolveOriginStrict` sem default) nem
 * monta reply/teclado (idem — confirmação e teclado pós-save diferem entre os
 * dois caminhos). Caller decide o que fazer com `success: false` (sempre
 * `buildErrorReply(message)`, `resultCode: "validation_error"`, igual nos
 * dois callers hoje).
 *
 * Regra determinística de `isPaid` (docs/30-TELEGRAM.md, "Parsing por IA"):
 * `date` resolvida > hoje (America/Sao_Paulo) = previsto (`isPaid=false`),
 * senão pago (`isPaid=true`) — nunca decidida pela IA. O fallback regex
 * sempre passa "hoje" como `date` → sempre pago, mesmo comportamento de
 * antes (que nem setava `date`/`isPaid`, caindo nos defaults do schema:
 * `date=new Date()`, `isPaid=true` — equivalente). O caminho IA passa
 * `draft.date ?? hoje`, preservando a regra de previsto/pago que já existia
 * só em `draft.ts`.
 */
export async function createBotTransaction(
  userId: string,
  input: CreateBotTransactionInput,
): Promise<CreateBotTransactionResult> {
  const today = toDateInputValueSaoPaulo();
  const isPaid = input.date <= today;
  const telegramTagId = await resolveTelegramTagId(userId);

  const parsed = createTransactionSchema.safeParse({
    description: input.description,
    amount: input.amount,
    type: input.type,
    categoryId: input.category.id,
    ...originPayload(input.origin),
    date: input.date,
    isPaid,
    tagIds: [telegramTagId],
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const created = await transactionService.createTransaction(userId, parsed.data);
  return { success: true, created };
}
