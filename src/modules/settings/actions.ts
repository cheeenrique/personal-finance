"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { settingsService, toClientUserSettings } from "./service";
import { updateSettingsSchema } from "./schemas";
import { SettingsDomainError } from "./errors";
import type { ActionResult, ClientUserSettings, TelegramLinkCode } from "./types";

const SETTINGS_PATH = "/settings";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof SettingsDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/settings] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

export async function getSettingsAction(): Promise<ActionResult<ClientUserSettings>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    // `getSettingsForClient` (não `getSettings`) — nunca deixa o client ver um código de vínculo já expirado.
    const settings = await settingsService.getSettingsForClient(userId);
    return { success: true, data: settings };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSettingsAction(input: unknown): Promise<ActionResult<ClientUserSettings>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const settings = await settingsService.updateSettings(userId, parsed.data);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: toClientUserSettings(settings) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function generateTelegramLinkCodeAction(): Promise<ActionResult<TelegramLinkCode>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const linkCode = await settingsService.generateTelegramLinkCode(userId);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: linkCode };
  } catch (error) {
    return toActionError(error);
  }
}

export async function unlinkTelegramAction(): Promise<ActionResult<ClientUserSettings>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const settings = await settingsService.unlinkTelegram(userId);
    revalidatePath(SETTINGS_PATH);
    return { success: true, data: toClientUserSettings(settings) };
  } catch (error) {
    return toActionError(error);
  }
}
