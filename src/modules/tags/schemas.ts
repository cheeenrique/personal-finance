import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(60),
  color: z.string().trim().min(1, "Cor é obrigatória").max(30),
});

export const updateTagSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().trim().min(1).max(30).optional(),
});

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type UpdateTagInput = z.infer<typeof updateTagSchema>;
