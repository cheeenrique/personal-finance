import { z } from "zod";

/**
 * Schema de validação do input de login. Mensagens de erro aqui nunca chegam
 * à UI diretamente — o form mostra sempre o erro genérico de `10-AUTH.md`,
 * sem revelar qual campo falhou.
 */
export const loginSchema = z.object({
  email: z.email({ error: "Email inválido." }).trim(),
  password: z.string().min(1, { error: "Informe sua senha." }),
});

export type LoginInput = z.infer<typeof loginSchema>;
