import type { UserSettings } from "@/generated/prisma/client";
import type { Theme } from "@/generated/prisma/enums";

export type { UserSettings, Theme };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Código de vínculo do Telegram ainda válido (docs/12-SETTINGS.md, "3. Telegram"). */
export type TelegramLinkCode = { code: string; expiresAt: Date };

/**
 * `UserSettings` com os 3 campos de threshold (`Prisma.Decimal`) convertidos
 * para `string` — forma que cruza a fronteira Server Action → Client
 * Component (mesma regra de `ClientTransaction` em
 * `modules/transactions/types.ts`: `Prisma.Decimal` é uma instância de classe
 * e não sobrevive à serialização de Server Actions sem essa conversão
 * explícita).
 */
export type ClientUserSettings = Omit<
  UserSettings,
  "alertAnomalyMultiplier" | "alertMinimumAmount" | "alertGreenMultiplier"
> & {
  alertAnomalyMultiplier: string;
  alertMinimumAmount: string;
  alertGreenMultiplier: string;
};
