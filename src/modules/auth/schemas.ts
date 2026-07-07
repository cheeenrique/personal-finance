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

/** Card de Perfil em `/settings` — nome/email editáveis (docs/10-AUTH.md, "Perfil do Usuário"). Colisão de email é tratada no service.ts (`EMAIL_TAKEN`), não aqui. */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, { error: "Nome é obrigatório." }).max(120),
  email: z.email({ error: "Email inválido." }).trim(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * Troca de senha — `currentPassword` é comparada contra o hash no service.ts
 * (`INVALID_CURRENT_PASSWORD` se não bater). `newPassword` min 8 chars e
 * diferente da atual (checagem de igualdade literal aqui; o service.ts é
 * quem sabe se ela bate com o hash salvo).
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: "Informe sua senha atual." }),
    newPassword: z.string().min(8, { error: "A nova senha deve ter pelo menos 8 caracteres." }),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "A nova senha deve ser diferente da atual.",
    path: ["newPassword"],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
