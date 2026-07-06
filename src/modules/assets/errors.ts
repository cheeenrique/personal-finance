/**
 * Erros de domínio do módulo assets.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class AssetDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AssetDomainError";
  }
}

export class AssetNotFoundError extends AssetDomainError {
  constructor(assetId: string, cause?: unknown) {
    super(`Ativo não encontrado: ${assetId}`, "ASSET_NOT_FOUND", cause, { assetId });
  }
}
