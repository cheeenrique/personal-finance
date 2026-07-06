import type { UserSettings } from "@/generated/prisma/client";
import type { Theme } from "@/generated/prisma/enums";

export type { UserSettings, Theme };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Código de vínculo do Telegram ainda válido (docs/12-SETTINGS.md, "3. Telegram"). */
export type TelegramLinkCode = { code: string; expiresAt: Date };
