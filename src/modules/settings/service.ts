import crypto from "node:crypto";
import type { UserSettings } from "@/generated/prisma/client";
import { settingsRepository, type UpdateSettingsData } from "./repository";
import type { TelegramLinkCode } from "./types";

/** Lazy-create idempotente — garante UserSettings mesmo se o seed não rodou pra esse usuário (docs/12-SETTINGS.md, "Regra 1"). */
async function getSettings(userId: string): Promise<UserSettings> {
  return settingsRepository.findOrCreate(userId);
}

async function updateSettings(userId: string, input: UpdateSettingsData): Promise<UserSettings> {
  // Garante que a linha existe antes de atualizar (usuário pode nunca ter acessado /settings).
  const current = await settingsRepository.findOrCreate(userId);

  const hasChanges = Object.values(input).some((value) => value !== undefined);
  if (!hasChanges) return current;

  return settingsRepository.update(userId, input);
}

/** Charset sem caracteres ambíguos (sem 0/O, 1/I) — código lido/digitado à mão no Telegram. */
const LINK_CODE_CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_LENGTH = 6;
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

/** `crypto.randomInt` (CSPRNG) — nunca `Math.random` pra um código usado como credencial de vínculo. */
function generateLinkCode(): string {
  let code = "";
  for (let i = 0; i < LINK_CODE_LENGTH; i += 1) {
    code += LINK_CODE_CHARSET[crypto.randomInt(LINK_CODE_CHARSET.length)];
  }
  return code;
}

/**
 * Gera um novo código de vínculo do Telegram, válido por 15min
 * (docs/12-SETTINGS.md, "3. Telegram"). Gerar de novo com um `telegramChatId`
 * já vinculado é permitido — trocar de celular é caso de uso legítimo, o
 * vínculo antigo só é sobrescrito quando o novo código for confirmado
 * (`modules/telegram/link.ts`).
 */
async function generateTelegramLinkCode(userId: string): Promise<TelegramLinkCode> {
  await settingsRepository.findOrCreate(userId);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MS);
  await settingsRepository.setTelegramLinkCode(userId, code, expiresAt);

  return { code, expiresAt };
}

/** Desvincula o chat_id do usuário — para de receber/lançar por Telegram até um novo vínculo. */
async function unlinkTelegram(userId: string): Promise<UserSettings> {
  await settingsRepository.findOrCreate(userId);
  return settingsRepository.clearTelegramChatId(userId);
}

/** Código pendente "vivo" (não expirado) — `null` se não houver código ou se já expirou. */
function activeTelegramLinkCode(
  settings: Pick<UserSettings, "telegramLinkCode" | "telegramLinkCodeExpiresAt">,
): TelegramLinkCode | null {
  if (!settings.telegramLinkCode || !settings.telegramLinkCodeExpiresAt) return null;
  if (settings.telegramLinkCodeExpiresAt.getTime() <= Date.now()) return null;

  return { code: settings.telegramLinkCode, expiresAt: settings.telegramLinkCodeExpiresAt };
}

/**
 * Versão de `getSettings` segura para sair do backend via Server Action: um
 * código de vínculo expirado nunca aparece pro client como se ainda fosse
 * válido — a lógica de expiração é regra de negócio, então vive aqui (não em
 * `actions.ts`, docs/99-CLAUDE.md "Regra de Ouro").
 */
async function getSettingsForClient(userId: string): Promise<UserSettings> {
  const settings = await getSettings(userId);
  if (activeTelegramLinkCode(settings)) return settings;

  return { ...settings, telegramLinkCode: null, telegramLinkCodeExpiresAt: null };
}

export const settingsService = {
  getSettings,
  updateSettings,
  generateTelegramLinkCode,
  unlinkTelegram,
  activeTelegramLinkCode,
  getSettingsForClient,
};
