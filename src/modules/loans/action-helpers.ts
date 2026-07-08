import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { LoanDomainError } from "./errors";
import type { ActionError } from "./types";

/**
 * Helpers compartilhados entre `actions.ts` e `amortization-actions.ts` —
 * arquivo PRÓPRIO (sem `"use server"`) porque um módulo com essa diretiva só
 * pode exportar `async function`s (constraint do Next.js): `toActionError`/
 * `revalidateLoanRoutes`/`UNAUTHENTICATED_ERROR` não são Server Actions em si,
 * só utilitário de borda, então não podem viver dentro de um arquivo
 * `"use server"` se precisam ser importados por OUTRO arquivo `"use server"`
 * (rule 05-naming-size.md: `actions.ts` passou de 300 linhas ao ganhar a
 * antecipação — split por responsabilidade, não subir o limite).
 */

const LOANS_PATH = "/loans";
const ACCOUNTS_PATH = "/accounts";
const DASHBOARD_PATH = "/dashboard";

export async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

export const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

export function toActionError(error: unknown): { success: false; error: ActionError } {
  if (error instanceof LoanDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/loans] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

/** Empréstimo/financiamento/antecipação alterado geralmente aparece no histórico da conta e no dashboard (parcelas previstas). */
export function revalidateLoanRoutes(): void {
  revalidatePath(LOANS_PATH);
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath(DASHBOARD_PATH);
}
