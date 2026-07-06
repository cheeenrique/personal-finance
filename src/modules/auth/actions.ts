"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn, signOut } from "@/lib/auth";

export type LoginActionState = {
  error: string | null;
};

const GENERIC_LOGIN_ERROR =
  "Credenciais inválidas ou muitas tentativas. Tente novamente em instantes.";

/**
 * Server Action de login. Delega toda a validação/autenticação para o
 * Auth.js (que por sua vez chama `authenticateWithCredentials`, ver
 * `authorize()` em `lib/auth/config.ts`) — aqui só traduzimos o resultado
 * em estado de UI.
 */
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: GENERIC_LOGIN_ERROR };
    }
    throw error;
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
