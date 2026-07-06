import type { UserSettings } from "@/generated/prisma/client";
import type { Theme } from "@/generated/prisma/enums";

export type { UserSettings, Theme };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
