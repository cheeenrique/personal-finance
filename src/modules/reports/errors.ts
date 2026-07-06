/**
 * Erros de domínio do módulo reports.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class ReportDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ReportDomainError";
  }
}

/**
 * Guarda de defesa em profundidade contra `dateFrom > dateTo` — o caso comum
 * já é barrado no boundary por `schemas.ts` (zod `.refine`), mas o service
 * também é chamado diretamente pelo script de verificação da task, sem passar
 * pelo zod. Nunca confie só na validação de borda para uma invariante central.
 */
export class InvalidDateRangeError extends ReportDomainError {
  constructor(dateFrom: Date, dateTo: Date) {
    super("Data inicial não pode ser posterior à data final", "INVALID_DATE_RANGE", undefined, {
      dateFrom,
      dateTo,
    });
  }
}
