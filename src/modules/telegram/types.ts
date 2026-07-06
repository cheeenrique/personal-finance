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
