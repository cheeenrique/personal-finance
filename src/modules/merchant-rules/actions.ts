"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { merchantRuleService } from "./service";
import { createMerchantRuleSchema } from "./schemas";
import { MerchantRuleDomainError } from "./errors";
import type { MerchantCategoryRule, ActionResult } from "./types";

const SETTINGS_PATH = "/settings";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof MerchantRuleDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/merchant-rules] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

export async function createMerchantRuleAction(input: unknown): Promise<ActionResult<MerchantCategoryRule>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createMerchantRuleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const rule = await merchantRuleService.createRule(userId, parsed.data);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: rule };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMerchantRuleAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await merchantRuleService.deleteRule(userId, id);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listMerchantRulesAction(): Promise<ActionResult<MerchantCategoryRule[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const rules = await merchantRuleService.listRules(userId);
    return { success: true, data: rules };
  } catch (error) {
    return toActionError(error);
  }
}
