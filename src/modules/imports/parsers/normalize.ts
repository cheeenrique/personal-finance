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

/** Só valida a ENVOLTÓRIA `{ transactions: [...] }` — cada item é validado individualmente
 * por `normalizeTransactionItem`, pra um item malformado virar erro isolado em vez de
 * descartar o documento inteiro. */
export function parseTransactionEnvelope(rawJson: unknown): unknown[] | null {
  const envelope = z.object({ transactions: z.array(z.unknown()) }).safeParse(rawJson);
  return envelope.success ? envelope.data.transactions : null;
}

export function normalizeTransactionItem(raw: unknown): { transaction: ParsedTransaction } | { error: ImportParseError } {
  const parsed = transactionItemSchema.safeParse(raw);
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
    },
  };
}
