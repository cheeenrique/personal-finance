export type TelegramTransactionType = "INCOME" | "EXPENSE";

/**
 * Comando tipado resolvido pelo parser (docs/30-TELEGRAM.md, "Comandos" +
 * "Regras de Parsing"). `keywordCandidates` são as palavras candidatas a
 * bater com o nome de uma categoria do usuário — palavra explícita extra
 * (ex.: "restaurante" em "almoço 45 restaurante") vem antes da descrição na
 * lista, porque uma palavra explícita é mais confiável que a descrição
 * genérica (ver `resolve.ts`, `matchByKeyword`).
 */
export type ParsedCommand =
  | {
      kind: "create_transaction";
      type: TelegramTransactionType;
      amount: string;
      description: string;
      keywordCandidates: string[];
    }
  | { kind: "query_balance" }
  | { kind: "query_month_expenses" }
  | { kind: "query_today" }
  | { kind: "unknown" };

/**
 * Resultado de executar um comando: texto de resposta pro usuário + código
 * curto pro log (`chat_id=X -> resultCode`). O log NUNCA usa `text` — só
 * `resultCode` (docs/30-TELEGRAM.md, "Segurança": nunca logar corpo da
 * mensagem nem valores monetários).
 */
export type CommandResult = {
  text: string;
  resultCode: string;
};

/** Origem citada numa mensagem de lançamento livre — "cartão X" vs "conta X" (ver `ai-parser.ts`/`resolve.ts`). */
export type TelegramOriginKind = "account" | "card";

/** Origem já resolvida pra um `accountId`/`cardId` real do usuário, com label pronto pra exibição na confirmação (ver `reply.ts`). */
export type TelegramOrigin =
  | { kind: "account"; id: string; label: string }
  | { kind: "card"; id: string; label: string };

/**
 * Canal usado no lançamento (docs/30-TELEGRAM.md, "paymentMethod") — refina
 * `originKind`/`originName`: "credit" só resolve pra CARTÃO, os demais só pra
 * CONTA (ver `resolve.ts`, `expectedOriginKind`). `null` quando a mensagem não
 * menciona nenhum canal (ambíguo — aceita conta OU cartão no match).
 */
export type TelegramPaymentMethod = "credit" | "debit" | "pix" | "transfer" | "cash";

/**
 * Saída estruturada do parsing por IA (docs/30-TELEGRAM.md, "Parsing por
 * IA") — já validada contra `aiResponseSchema` (zod) em `ai-parser.ts`.
 * `isTransaction=false` quando a mensagem não é um lançamento (saudação,
 * pergunta etc.). `amount` vem `null` quando a mensagem não menciona nenhum
 * valor (docs/30-TELEGRAM.md, "Fluxo conversacional" — vira pergunta, nunca
 * um valor inventado). `date`/`categoryName`/`paymentMethod`/`originKind`/
 * `originName` vêm `null` quando a mensagem não menciona o respectivo dado —
 * resolução determinística (data default = hoje, categoria = fallback) fica
 * por conta do chamador (`draft.ts`), nunca da IA.
 */
export type AiParsedTransaction = {
  isTransaction: boolean;
  type: TelegramTransactionType;
  amount: string | null;
  description: string;
  date: string | null;
  categoryName: string | null;
  paymentMethod: TelegramPaymentMethod | null;
  originKind: TelegramOriginKind | null;
  originName: string | null;
};

/** Campo obrigatório ainda faltando num lançamento em progresso (docs/30-TELEGRAM.md, "Fluxo conversacional"). Categoria nunca entra aqui — sempre tem fallback ("Outros"/"Outros (Receita)"), nunca bloqueia. */
export type TelegramMissingField = "amount" | "origin";

/**
 * Resultado de casar o texto de origem citado (IA ou resposta de pending)
 * contra contas/cartões REAIS e ATIVOS do usuário (`resolve.ts`,
 * `resolveOriginStrict` — docs/30-TELEGRAM.md, bug fix "match por contém" +
 * ambiguidade): "resolved" = exatamente 1 candidato bateu; "ambiguous" = mais
 * de um bateu (ex.: "Nubank" batendo em "Nubank - Pessoal" E "Nubank - MEI")
 * — o chamador (`draft.ts`) pergunta qual, listando `candidates`; "none" =
 * nada bateu (ou não havia origem nenhuma pra tentar casar).
 */
export type OriginMatchResult =
  | { status: "resolved"; origin: TelegramOrigin }
  | { status: "ambiguous"; candidates: TelegramOrigin[] }
  | { status: "none" };

/** Um item do array `message.photo` do Telegram — do menor pro maior (thumb→full). */
export type TelegramPhotoSize = { file_id: string; width: number; height: number };

/**
 * Foto já detectada/normalizada de um update (docs/30-TELEGRAM.md — extração
 * por Gemini vision, ver `photo.ts`): `fileId` da MAIOR resolução disponível +
 * `caption` opcional (texto que o usuário mandou junto da foto), usado como
 * dica extra no prompt (`ai-parser.ts`, `buildImagePrompt`).
 */
export type TelegramPhotoInput = { fileId: string; caption: string | null };

/**
 * Rascunho de um lançamento em progresso — persistido em
 * `TelegramPendingEntry.draftJson` (Prisma `Json`) enquanto falta valor e/ou
 * origem (docs/30-TELEGRAM.md, "Fluxo conversacional"). Superset serializável
 * de `AiParsedTransaction` sem `isTransaction` (sempre `true` a partir do
 * momento em que vira draft — ver `draft.ts`, `draftFromAi`).
 */
export type TelegramDraft = {
  type: TelegramTransactionType;
  amount: string | null;
  description: string;
  date: string | null;
  categoryName: string | null;
  paymentMethod: TelegramPaymentMethod | null;
  originKind: TelegramOriginKind | null;
  originName: string | null;
};
