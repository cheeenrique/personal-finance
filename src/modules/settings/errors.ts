/**
 * Erros de domínio do módulo settings.
 *
 * `getSettings` é lazy-create (sempre resolve, nunca "not found") e
 * `updateSettings` valida ranges via Zod no boundary — hoje não há caso de
 * negócio real que precise de um erro tipado específico. Classe base mantida
 * por simetria com os demais módulos e para cobrir erro inesperado do Prisma
 * (ver ~/.claude/rules/06-composition-errors.md — "erros são dado").
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
