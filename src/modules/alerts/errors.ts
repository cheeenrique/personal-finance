/**
 * Erros de domínio do módulo alerts.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class AlertDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AlertDomainError";
  }
}

/**
 * Alerta não encontrado OU não pertence ao usuário — `repository.markRead`
 * escopa por `userId` antes de atualizar (docs/10-AUTH.md, "Regra Principal
 * de Segurança"), então ambos os casos colapsam no mesmo erro (não vaza se o
 * id existe para outro usuário).
 */
export class AlertNotFoundError extends AlertDomainError {
  constructor(alertId: string, cause?: unknown) {
    super(`Alerta não encontrado: ${alertId}`, "ALERT_NOT_FOUND", cause, { alertId });
  }
}
