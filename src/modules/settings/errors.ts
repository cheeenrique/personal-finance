/**
 * Erros de domínio do módulo settings.
 *
 * `getSettings` é lazy-create (sempre resolve, nunca "not found") e
 * `updateSettings` valida ranges via Zod no boundary — por muito tempo não
 * houve caso de negócio real que precisasse de um erro tipado específico.
 * Classe base mantida por simetria com os demais módulos e para cobrir erro
 * inesperado do Prisma (ver ~/.claude/rules/06-composition-errors.md —
 * "erros são dado").
 */
export class SettingsDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SettingsDomainError";
  }
}

/**
 * Token de bot do Telegram inválido/revogado — `installTelegramBot`
 * (docs/30-TELEGRAM.md, modelo "traga seu próprio bot") valida via `getMe`
 * antes de gravar qualquer coisa no banco.
 */
export class TelegramInvalidTokenError extends SettingsDomainError {
  constructor() {
    super(
      "Token do bot inválido — confira se copiou certinho do @BotFather.",
      "TELEGRAM_INVALID_TOKEN",
    );
  }
}

/**
 * `retryTelegramWebhook` chamado sem bot instalado — não há
 * `telegramBotToken`/`telegramWebhookSecret` salvos pra reenviar ao Telegram
 * (modules/settings/service.ts). Usuário precisa instalar um bot primeiro.
 */
export class TelegramBotNotInstalledError extends SettingsDomainError {
  constructor() {
    super(
      "Nenhum bot instalado — instale um bot antes de revalidar o webhook.",
      "TELEGRAM_BOT_NOT_INSTALLED",
    );
  }
}
