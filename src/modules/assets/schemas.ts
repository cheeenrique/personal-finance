import { z } from "zod";
import { AssetType } from "@/generated/prisma/enums";
import { parseInSaoPaulo } from "@/lib/date/timezone";

const ASSET_TYPE_VALUES = Object.values(AssetType) as [AssetType, ...AssetType[]];

/**
 * Valor monetário aceito na borda (number ou string), normalizado para string
 * decimal com no máximo 2 casas — nunca float na regra de negócio (ver
 * docs/03-DATABASE.md). Mesmo parser de `modules/accounts/schemas.ts` e
 * `modules/transactions/schemas.ts` — já é a 3ª/4ª ocorrência (com
 * `modules/recurring/schemas.ts`), o que cruza o limiar de extração da rule
 * 02-dry-kiss-yagni ("3 ocorrências = extrair pra helper"). Mantido colocado
 * aqui por enquanto porque o escopo desta task restringe as mudanças a
 * `modules/assets`, `modules/recurring` e ao cron — extração pra `lib/money`
 * fica como sugestão de melhoria separada (ver retorno da task).
 */
const decimalStringSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^-?\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor monetário inválido — use até 2 casas decimais",
  });

/** Igual a `decimalStringSchema`, mas exige positivo — espelha o CHECK `value > 0` implícito em Asset. */
const positiveDecimalSchema = decimalStringSchema.refine((value) => Number(value) > 0, {
  message: "Valor deve ser positivo",
});

/**
 * Mesma estratégia de `modules/transactions/schemas.ts` `parseFlexibleDate`:
 * string `YYYY-MM-DD` é tratada como meia-noite em America/Sao_Paulo, não
 * UTC. 2ª ocorrência no projeto — ainda aceitável (rule 02-dry-kiss-yagni).
 */
function parseFlexibleDate(value: string | Date): Date {
  if (value instanceof Date) return value;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
  }

  return new Date(value);
}

const dateInputSchema = z
  .union([z.string(), z.date()])
  .transform(parseFlexibleDate)
  .refine((date) => !Number.isNaN(date.getTime()), { message: "Data inválida" });

export const createAssetSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(120),
  type: z.enum(ASSET_TYPE_VALUES),
  purchaseValue: positiveDecimalSchema,
  currentValue: positiveDecimalSchema,
  purchaseDate: dateInputSchema,
  notes: z.string().trim().max(1000).optional(),
});

/**
 * Update é parcial. Quando `currentValue` é enviado, o service (ver
 * service.ts `updateAsset`) grava um `AssetSnapshot` atômico com o update —
 * regra central do módulo (docs/27-ASSETS.md, "Toda atualização de
 * currentValue grava um AssetSnapshot").
 */
export const updateAssetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(ASSET_TYPE_VALUES).optional(),
  purchaseValue: positiveDecimalSchema.optional(),
  currentValue: positiveDecimalSchema.optional(),
  purchaseDate: dateInputSchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
