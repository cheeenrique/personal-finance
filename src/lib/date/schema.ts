import { z } from "zod";
import { parseInSaoPaulo } from "./timezone";

/**
 * Interpreta uma data de entrada de duas formas:
 * - `Date` já resolvida → passa direto.
 * - string `YYYY-MM-DD` (sem hora, ex.: date picker) → tratada como meia-noite
 *   em America/Sao_Paulo, não UTC. Sem esse cuidado, `new Date("2026-07-06")`
 *   parseia como 00:00 UTC = 21:00 do dia anterior em SP — deslocaria a data
 *   percebida pelo usuário (ver docs/01-STACK.md, timezone fixo em todo cálculo).
 * - qualquer outra string (ISO com hora/offset) → `new Date(string)`, já
 *   inequívoca.
 *
 * Canônico do projeto — era copiado identicamente em `modules/transactions`,
 * `cards`, `assets` e `reports` (rule 02-dry-kiss-yagni, "3 ocorrências =
 * extrair pra helper").
 */
export function parseFlexibleDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
  }

  return new Date(value);
}

export const dateInputSchema = z
  .union([z.string(), z.date()])
  .transform(parseFlexibleDate)
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Data inválida" });
