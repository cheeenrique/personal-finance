import { z } from "zod";
import { Theme } from "@/generated/prisma/enums";

const THEME_VALUES = Object.values(Theme) as [Theme, ...Theme[]];

/**
 * Multiplicadores de alerta (`alertAnomalyMultiplier`/`alertGreenMultiplier`)
 * são `Decimal(4,2)` no schema — até 2 casas decimais, máx 99.99 — e precisam
 * ser > 0 (docs/12-SETTINGS.md, "2. Alertas (Thresholds)").
 */
const multiplierSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,2}(\.\d{1,2})?$/.test(value), {
    message: "Multiplicador inválido — use até 2 casas decimais (máx. 99.99)",
  })
  .refine((value) => Number(value) > 0, { message: "Multiplicador deve ser maior que zero" });

/** `alertMinimumAmount` é `Decimal(12,2)` — mesmo formato de dinheiro do resto do app (docs/03-DATABASE.md). */
const minimumAmountSchema = z
  .union([z.number(), z.string()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+(\.\d{1,2})?$/.test(value), {
    message: "Valor inválido — use até 2 casas decimais",
  })
  .refine((value) => Number(value) >= 0, { message: "Valor mínimo não pode ser negativo" });

export const updateSettingsSchema = z.object({
  currency: z.string().trim().min(3, "Moeda inválida").max(10).optional(),
  timezone: z.string().trim().min(1, "Timezone inválido").optional(),
  theme: z.enum(THEME_VALUES).optional(),
  alertAnomalyMultiplier: multiplierSchema.optional(),
  alertMinimumAmount: minimumAmountSchema.optional(),
  alertGreenMultiplier: multiplierSchema.optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
