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
 * Saída estruturada do parsing por IA (docs/30-TELEGRAM.md, "Parsing por
 * IA") — já validada contra `aiResponseSchema` (zod) em `ai-parser.ts`.
 * `isTransaction=false` quando a mensagem não é um lançamento (saudação,
 * pergunta etc.). `date`/`categoryName`/`originKind`/`originName` vêm `null`
 * quando a mensagem não menciona o respectivo dado — resolução determinística
 * (data default = hoje, categoria/origem = fallback) fica por conta do
 * chamador (`handlers.ts`), nunca da IA.
 */
export type AiParsedTransaction = {
  isTransaction: boolean;
  type: TelegramTransactionType;
  amount: string;
  description: string;
  date: string | null;
  categoryName: string | null;
  originKind: TelegramOriginKind | null;
  originName: string | null;
};
