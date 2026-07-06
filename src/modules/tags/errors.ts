/**
 * Erros de domínio do módulo tags.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class TagDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TagDomainError";
  }
}

export class TagNotFoundError extends TagDomainError {
  constructor(tagId: string, cause?: unknown) {
    super(`Tag não encontrada: ${tagId}`, "TAG_NOT_FOUND", cause, { tagId });
  }
}
