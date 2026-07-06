import { z } from "zod";

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Canônico do projeto: era copiado identicamente em
 * `modules/accounts`, `transactions`, `cards`, `budgets`, `assets` e
 * `recurring` — extraído aqui (rule 02-dry-kiss-yagni, "3 ocorrências =
 * extrair pra helper").
 */
export const decimalStringSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido — use até 2 casas decimais",
  });

/** Igual a `decimalStringSchema`, mas exige positivo — espelha os CHECKs `amount > 0` / `value > 0` do banco. */
export const positiveDecimalSchema = decimalStringSchema.refine((value) => Number(value) > 0, {
  message: "Valor deve ser positivo",
});
