import { normalizeWord } from "./normalize";
import type { ParsedCommand } from "./types";

/** Valor monetário aceito na mensagem — inteiro ou com até 2 casas, separador `,` ou `.` (BR). */
const AMOUNT_PATTERN = /^\d+(?:[.,]\d{1,2})?$/;

/** Palavras que sinalizam receita (docs/30-TELEGRAM.md, "Receita": "salário 5000", "freela 800"). */
const INCOME_KEYWORDS = new Set(["salario", "freela", "freelance"].map(normalizeWord));

/**
 * Interpreta a mensagem do usuário (docs/30-TELEGRAM.md, "Regras de
 * Parsing"). Função pura — sem I/O, sem acesso a banco. A inferência de
 * categoria por nome real de categoria/histórico é responsabilidade de
 * `resolve.ts` (impuro, precisa do userId); aqui só produzimos os
 * `keywordCandidates` (palavras candidatas), na ordem: palavra explícita
 * extra primeiro (mais confiável), descrição por último.
 *
 * Regra 1: número presente = valor obrigatório. Regra 4: 1ª palavra =
 * descrição. Sem número reconhecido e sem bater com um comando conhecido →
 * `unknown` (mensagem não gera transação nem é um comando válido).
 */
function parseMessage(rawText: string): ParsedCommand {
  const trimmed = rawText.trim();
  if (!trimmed) return { kind: "unknown" };

  const tokens = trimmed.split(/\s+/);
  const normalizedTokens = tokens.map(normalizeWord);

  if (normalizedTokens.length === 1 && normalizedTokens[0] === "saldo") {
    return { kind: "query_balance" };
  }

  if (normalizedTokens.length === 1 && normalizedTokens[0] === "hoje") {
    return { kind: "query_today" };
  }

  if (normalizedTokens.length === 2 && normalizedTokens[0] === "gastos" && normalizedTokens[1] === "mes") {
    return { kind: "query_month_expenses" };
  }

  if (tokens.length < 2) return { kind: "unknown" };

  const description = tokens[0];
  const amountIndex = tokens.findIndex((token, index) => index > 0 && AMOUNT_PATTERN.test(token));
  if (amountIndex === -1) return { kind: "unknown" };

  const amount = tokens[amountIndex].replace(",", ".");
  const remainderWords = tokens.filter((_, index) => index !== 0 && index !== amountIndex);
  const type = INCOME_KEYWORDS.has(normalizeWord(description)) ? "INCOME" : "EXPENSE";

  return {
    kind: "create_transaction",
    type,
    amount,
    description,
    keywordCandidates: [...remainderWords, description],
  };
}

export const telegramParser = { parseMessage };
