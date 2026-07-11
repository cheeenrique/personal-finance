import { z } from "zod";
import { GoalSourceType } from "@/generated/prisma/enums";
import { decimalStringSchema, positiveDecimalSchema } from "@/lib/money/schema";
import { dateInputSchema } from "@/lib/date/schema";

const GOAL_SOURCE_TYPE_VALUES = Object.values(GoalSourceType) as [GoalSourceType, ...GoalSourceType[]];

/**
 * `currentAmount` (MANUAL) nunca negativo — meta poupada não "deve" dinheiro.
 * Só um caller (este arquivo), por isso local em vez de `lib/money/schema.ts`
 * (rule 02-dry-kiss-yagni, "DRY prematuro é pior que duplicação").
 */
const nonNegativeDecimalSchema = decimalStringSchema.refine((value) => Number(value) >= 0, {
  message: "Valor não pode ser negativo",
});

/**
 * Consistência `sourceType` x `sourceAccountId`/`sourceAssetId` (regra de
 * domínio da meta): ACCOUNT exige conta, ASSET exige ativo, MANUAL não pode
 * ter nenhum dos dois. MESMA regra reforçada em `service.ts`
 * `assertValidSource` — necessário lá porque este `superRefine` só valida o
 * shape de `createGoalSchema`; um update parcial não revalida contra o
 * estado mesclado (ver JSDoc de `updateGoalSchema` abaixo).
 */
function assertSourceConsistency(
  data: { sourceType: GoalSourceType; sourceAccountId?: string; sourceAssetId?: string },
  ctx: z.RefinementCtx,
): void {
  if (data.sourceType === GoalSourceType.ACCOUNT && !data.sourceAccountId) {
    ctx.addIssue({
      code: "custom",
      message: "Conta de origem é obrigatória para sourceType ACCOUNT",
      path: ["sourceAccountId"],
    });
  }
  if (data.sourceType === GoalSourceType.ASSET && !data.sourceAssetId) {
    ctx.addIssue({
      code: "custom",
      message: "Ativo de origem é obrigatório para sourceType ASSET",
      path: ["sourceAssetId"],
    });
  }
  if (data.sourceType === GoalSourceType.MANUAL && (data.sourceAccountId || data.sourceAssetId)) {
    ctx.addIssue({
      code: "custom",
      message: "Meta MANUAL não pode ter conta/ativo de origem",
      path: ["sourceType"],
    });
  }
}

export const createGoalSchema = z
  .object({
    name: z.string().trim().min(1, "Nome é obrigatório").max(120),
    targetAmount: positiveDecimalSchema,
    targetDate: dateInputSchema.optional(),
    sourceType: z.enum(GOAL_SOURCE_TYPE_VALUES).default(GoalSourceType.MANUAL),
    sourceAccountId: z.string().trim().min(1).optional(),
    sourceAssetId: z.string().trim().min(1).optional(),
    currentAmount: nonNegativeDecimalSchema.optional(),
    monthlyContribution: positiveDecimalSchema.optional(),
  })
  .superRefine(assertSourceConsistency);

/**
 * Update é parcial — a consistência `sourceType`/`sourceAccountId`/
 * `sourceAssetId` NÃO é revalidada aqui contra o registro existente (o zod só
 * vê o patch enviado, não o estado atual). A revalidação real acontece em
 * `service.ts` `updateGoal` contra o estado MESCLADO (mesmo padrão de
 * `modules/budgets/service.ts` `updateBudget`, que revalida o unique
 * (categoryId, month, year) mesclado, não o patch isolado).
 */
export const updateGoalSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  targetAmount: positiveDecimalSchema.optional(),
  targetDate: dateInputSchema.nullable().optional(),
  sourceType: z.enum(GOAL_SOURCE_TYPE_VALUES).optional(),
  sourceAccountId: z.string().trim().min(1).nullable().optional(),
  sourceAssetId: z.string().trim().min(1).nullable().optional(),
  currentAmount: nonNegativeDecimalSchema.optional(),
  monthlyContribution: positiveDecimalSchema.nullable().optional(),
});

export type CreateGoalInput = z.infer<typeof createGoalSchema>;
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;
