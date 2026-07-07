import crypto from "node:crypto";
import type { UserSettings } from "@/generated/prisma/client";
import { telegramApi } from "@/modules/telegram/telegram-api";
import { settingsRepository, type UpdateSettingsData } from "./repository";
import { TelegramInvalidTokenError } from "./errors";
import type { ClientUserSettings, InstallTelegramBotResult, TelegramLinkCode } from "./types";

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

/**
 * Base pública do app pro `setWebhook` do Telegram — em dev (`http://localhost:3000`)
 * o Telegram sempre rejeita (exige HTTPS público); em produção (Vercel) é o
 * domínio real. Mesma env já usada pelo Auth.js (`AUTH_URL`, docs/10-AUTH.md)
 * — evita introduzir uma 2ª env só pra isso (YAGNI).
 */
function publicBaseUrl(): string {
  return process.env.AUTH_URL ?? "http://localhost:3000";
}

/**
 * Instala o bot "traga seu próprio bot" do usuário (docs/30-TELEGRAM.md):
 * 1) valida o token via `getMe` — token inválido nunca é gravado no banco;
 * 2) gera um webhook secret próprio (`crypto.randomBytes`, nunca reaproveita
 *    o de outro usuário — cada bot tem o seu);
 * 3) grava token + secret + username;
 * 4) tenta registrar o webhook no Telegram. Se falhar (ex.: sem URL pública
 *    em dev/localhost), o token FICA salvo mesmo assim — só devolve um aviso
 *    pra UI. O usuário não precisa reinstalar depois do deploy, só o
 *    `setWebhook` que falta rodar (hoje só roda de novo com um novo install;
 *    reintentar automaticamente pós-deploy é melhoria futura, ver retorno).
 */
async function installTelegramBot(userId: string, botToken: string): Promise<InstallTelegramBotResult> {
  await settingsRepository.findOrCreate(userId);

  const me = await telegramApi.getMe(botToken);
  if (!me.ok || !me.username) {
    throw new TelegramInvalidTokenError();
  }

  const webhookSecret = crypto.randomBytes(32).toString("hex");
  const webhookUrl = `${publicBaseUrl()}/api/telegram`;
  const webhookResult = await telegramApi.setWebhook(botToken, webhookUrl, webhookSecret);

  await settingsRepository.setTelegramBot(userId, {
    botToken,
    webhookSecret,
    botUsername: me.username,
    webhookRegistered: webhookResult.ok,
  });

  if (!webhookResult.ok) {
    return {
      botUsername: me.username,
      webhookRegistered: false,
      warning: `Bot salvo, mas o webhook não foi registrado (${webhookResult.error}). Isso é esperado em localhost — funciona automaticamente depois do deploy com uma URL pública.`,
    };
  }

  return { botUsername: me.username, webhookRegistered: true };
}

/**
 * Desinstala o bot: remove o webhook no Telegram (best-effort — falha aqui
 * nunca bloqueia a limpeza do banco) e limpa token/secret/username/chat/código
 * (`settingsRepository.clearTelegramBot`).
 */
async function uninstallTelegramBot(userId: string): Promise<UserSettings> {
  const current = await settingsRepository.findOrCreate(userId);

  if (current.telegramBotToken) {
    await telegramApi.deleteWebhook(current.telegramBotToken);
  }

  return settingsRepository.clearTelegramBot(userId);
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
 * `UserSettings` → `ClientUserSettings`: converte os 3 campos `Decimal` de
 * threshold para `string`. Fica aqui (não em `actions.ts`, ao contrário de
 * `toClientTransaction` em `modules/transactions/actions.ts`) porque várias
 * Server Actions (`getSettingsAction`, `updateSettingsAction`,
 * `unlinkTelegramAction`, `uninstallTelegramBotAction`) precisam da mesma
 * conversão antes de cruzar a fronteira Server → Client — `Prisma.Decimal`
 * não sobrevive a essa serialização sem conversão explícita.
 *
 * Allowlist explícita de campos (não `{ ...settings }`) de propósito:
 * `UserSettings` agora carrega `telegramBotToken`/`telegramWebhookSecret`
 * (secrets) — um spread esqueceria de excluir um novo campo sensível que
 * apareça no schema no futuro. Só `hasBot` (derivado) cruza a fronteira.
 */
export function toClientUserSettings(settings: UserSettings): ClientUserSettings {
  return {
    id: settings.id,
    userId: settings.userId,
    currency: settings.currency,
    timezone: settings.timezone,
    theme: settings.theme,
    alertAnomalyMultiplier: settings.alertAnomalyMultiplier.toString(),
    alertMinimumAmount: settings.alertMinimumAmount.toString(),
    alertGreenMultiplier: settings.alertGreenMultiplier.toString(),
    telegramBotUsername: settings.telegramBotUsername,
    telegramWebhookRegistered: settings.telegramWebhookRegistered,
    telegramChatId: settings.telegramChatId,
    telegramLinkCode: settings.telegramLinkCode,
    telegramLinkCodeExpiresAt: settings.telegramLinkCodeExpiresAt,
    hasBot: Boolean(settings.telegramBotToken),
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

/**
 * Versão de `getSettings` segura para sair do backend via Server Action: um
 * código de vínculo expirado nunca aparece pro client como se ainda fosse
 * válido — a lógica de expiração é regra de negócio, então vive aqui (não em
 * `actions.ts`, docs/99-CLAUDE.md "Regra de Ouro"). Já retorna
 * `ClientUserSettings` (100% serializável) — ver `toClientUserSettings`.
 */
async function getSettingsForClient(userId: string): Promise<ClientUserSettings> {
  const settings = await getSettings(userId);
  const sanitized = activeTelegramLinkCode(settings)
    ? settings
    : { ...settings, telegramLinkCode: null, telegramLinkCodeExpiresAt: null };

  return toClientUserSettings(sanitized);
}

export const settingsService = {
  getSettings,
  updateSettings,
  generateTelegramLinkCode,
  unlinkTelegram,
  installTelegramBot,
  uninstallTelegramBot,
  activeTelegramLinkCode,
  getSettingsForClient,
};
