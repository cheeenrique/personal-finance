/**
 * Erros de domínio do módulo projections.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary, não aqui.
 */
export class ProjectionDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProjectionDomainError";
  }
}

/** `horizonDays` precisa ser um inteiro positivo — janela de projeção não faz sentido vazia ou negativa. */
export class InvalidHorizonError extends ProjectionDomainError {
  constructor(horizonDays: number) {
    super(
      `Horizonte de projeção inválido: ${horizonDays} dias`,
      "PROJECTION_INVALID_HORIZON",
      undefined,
      { horizonDays },
    );
  }
}
