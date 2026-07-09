import { z } from "zod";

export const createMerchantRuleSchema = z.object({
  pattern: z.string().trim().min(1, "Padrão é obrigatório").max(120),
  categoryId: z.string().trim().min(1, "Categoria é obrigatória"),
});

export type CreateMerchantRuleInput = z.infer<typeof createMerchantRuleSchema>;
