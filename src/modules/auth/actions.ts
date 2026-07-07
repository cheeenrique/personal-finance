"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { signIn, signOut, auth } from "@/lib/auth";
import { authService } from "./service";
import { updateProfileSchema, changePasswordSchema } from "./schemas";
import { AuthDomainError } from "./errors";
import type { ActionResult, UpdatedProfile } from "./types";

export type LoginActionState = {
  error: string | null;
};

const SETTINGS_PATH = "/settings";

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof AuthDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/auth] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

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

/** Server Action só delega para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */
export async function updateProfileAction(input: unknown): Promise<ActionResult<UpdatedProfile>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const profile = await authService.updateProfile(userId, parsed.data);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: profile };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    await authService.changePassword(userId, parsed.data);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}
