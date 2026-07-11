import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { startOfDaySP } from "@/lib/date/calendar-sp";
import type { ImportParseError, ParsedTransaction } from "../types";

/**
 * Normalização/validação COMPARTILHADA entre `pdf-parser.ts` (extrato) e
 * `card-invoice-parser.ts` (fatura) — extraído aqui pra reuso literal (~/.claude/rules/02-dry-kiss-yagni.md,
 * DRY a partir do 2º caso concreto real: os dois parsers produzem exatamente o mesmo shape
 * de item — `{date, amount, type, description}` — a partir de uma IA). Erro-como-dado: item
 * malformado individual vira `ImportParseError` isolado, NUNCA descarta o documento inteiro.
 */

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_STRING_REGEX = /^\d+(\.\d+)?$/;

export const isoDateSchema = z.string().regex(ISO_DATE_REGEX, "esperado YYYY-MM-DD");
export const decimalStringSchema = z.string().regex(DECIMAL_STRING_REGEX, "esperado string decimal com ponto");

export const transactionItemSchema = z.object({
  date: isoDateSchema,
  amount: decimalStringSchema,
  type: z.enum(["EXPENSE", "INCOME"]),
  description: z.string().min(1),
  /** Sugestão de categoria da IA a partir do estabelecimento/descrição (só
   * `card-invoice-parser.ts` manda isso — `pdf-parser.ts` de extrato nunca
   * pede no prompt, então some fica `undefined` pra esse caso, sem afetar o
   * contrato de extrato). `null`/ausente = IA não soube sugerir. */
  categoryName: z.string().nullable().optional(),
});

export function safeSnippet(raw: unknown): string {
  try {
    return JSON.stringify(raw);
  } catch {
    return "";
  }
}

/** Bounds checadas antes de `startOfDaySP` — evita `Date` rolando pra outro mês (ex.: dia 40) silenciosamente. */
export function parseIsoDateSP(isoDate: string): Date | null {
  const match = isoDate.match(ISO_DATE_REGEX);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return startOfDaySP(year, month, day);
}

export function normalizeAmount(amount: string): string {
  return new Prisma.Decimal(amount).toFixed(2);
}

/**
 * A IA extrai a fatura pedindo ponto decimal no prompt (`buildInvoicePrompt`), mas às vezes
 * devolve uma linha em formato BR mesmo assim (vírgula decimal, com ou sem separador de
 * milhar — ex.: "1.486,64" ou "1486,64") — isso quebrava `decimalStringSchema` com "esperado
 * string decimal com ponto" (bug real, fatura real). Normaliza ANTES de validar: só mexe
 * quando tem vírgula (string já canônica com ponto passa intocada); com vírgula, remove
 * pontos de milhar e troca a vírgula decimal por ponto.
 */
function normalizeBRAmount(amount: string): string {
  if (!amount.includes(",")) return amount;
  return amount.replace(/\./g, "").replace(",", ".");
}

/** Só normaliza o campo `amount` quando `raw` já é um objeto plano com uma string nele — item
 * malformado (não-objeto, `amount` ausente/não-string) segue intocado pro
 * `transactionItemSchema` reportar o erro de shape de sempre em `normalizeTransactionItem`. */
function normalizeRawAmount(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || !("amount" in raw)) return raw;
  const amount = (raw as { amount: unknown }).amount;
  if (typeof amount !== "string") return raw;
  return { ...raw, amount: normalizeBRAmount(amount) };
}

/** Só valida a ENVOLTÓRIA `{ transactions: [...] }` — cada item é validado individualmente
 * por `normalizeTransactionItem`, pra um item malformado virar erro isolado em vez de
 * descartar o documento inteiro. */
export function parseTransactionEnvelope(rawJson: unknown): unknown[] | null {
  const envelope = z.object({ transactions: z.array(z.unknown()) }).safeParse(rawJson);
  return envelope.success ? envelope.data.transactions : null;
}

export function normalizeTransactionItem(raw: unknown): { transaction: ParsedTransaction } | { error: ImportParseError } {
  const parsed = transactionItemSchema.safeParse(normalizeRawAmount(raw));
  if (!parsed.success) {
    return {
      error: {
        snippet: safeSnippet(raw),
        reason: `Lançamento com formato inesperado: ${parsed.error.issues[0]?.message ?? "erro de validação"}`,
      },
    };
  }

  const date = parseIsoDateSP(parsed.data.date);
  if (!date) {
    return { error: { snippet: safeSnippet(raw), reason: `Data inválida: "${parsed.data.date}"` } };
  }

  return {
    transaction: {
      fitId: null,
      date,
      amount: normalizeAmount(parsed.data.amount),
      type: parsed.data.type,
      description: parsed.data.description.trim(),
      suggestedCategoryName: parsed.data.categoryName,
    },
  };
}
