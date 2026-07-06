import bcrypt from "bcryptjs";

import { loginSchema } from "./schemas";
import { findUserByEmail } from "./repository";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

/**
 * Erros como dado (ver `06-composition-errors.md`): a autenticação nunca
 * lança para o caso esperado de "credenciais inválidas" — quem chama decide
 * o que fazer (Auth.js trata `ok: false` retornando `null` do `authorize()`).
 */
export type AuthenticateResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; code: "INVALID_CREDENTIALS" };

const INVALID_CREDENTIALS: AuthenticateResult = {
  ok: false,
  code: "INVALID_CREDENTIALS",
};

/**
 * Valida e autentica um par email/senha contra o usuário provisionado via
 * seed. Não existe auto-criação de usuário (sem cadastro público, `10-AUTH.md`).
 *
 * Propositalmente não diferencia "email não encontrado" de "senha errada" no
 * retorno — ambos viram o mesmo `INVALID_CREDENTIALS`, para que a camada
 * acima (Auth.js `authorize()`) nunca tenha a tentação de vazar qual campo
 * errou.
 */
export async function authenticateWithCredentials(
  input: unknown
): Promise<AuthenticateResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return INVALID_CREDENTIALS;

  const user = await findUserByEmail(parsed.data.email);
  if (!user) return INVALID_CREDENTIALS;

  const passwordMatches = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordMatches) return INVALID_CREDENTIALS;

  return {
    ok: true,
    user: { id: user.id, name: user.name, email: user.email },
  };
}
