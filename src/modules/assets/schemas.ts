import { z } from "zod";
import { AssetType } from "@/generated/prisma/enums";
import { positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

const ASSET_TYPE_VALUES = Object.values(AssetType) as [AssetType, ...AssetType[]];

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
