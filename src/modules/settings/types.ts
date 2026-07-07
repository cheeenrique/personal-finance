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
 *
 * `telegramBotToken`/`telegramWebhookSecret` NUNCA cruzam essa fronteira —
 * são secrets (docs/30-TELEGRAM.md, "traga seu próprio bot"). No lugar, só
 * `hasBot` (booleano derivado) chega no client; `telegramBotUsername`/
 * `telegramWebhookRegistered` são só status de exibição, sem valor sensível.
 */
export type ClientUserSettings = Omit<
  UserSettings,
  "alertAnomalyMultiplier" | "alertMinimumAmount" | "alertGreenMultiplier" | "telegramBotToken" | "telegramWebhookSecret"
> & {
  alertAnomalyMultiplier: string;
  alertMinimumAmount: string;
  alertGreenMultiplier: string;
  hasBot: boolean;
};

/** Resultado de `installTelegramBotAction` (docs/30-TELEGRAM.md, "traga seu próprio bot"). */
export type InstallTelegramBotResult = {
  botUsername: string;
  webhookRegistered: boolean;
  /** Presente quando o webhook não pôde ser registrado (ex.: sem URL pública em dev) — token já foi salvo mesmo assim. */
  warning?: string;
};
