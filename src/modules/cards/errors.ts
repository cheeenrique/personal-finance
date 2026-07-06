/**
 * Erros de domínio do módulo cards.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class CardDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CardDomainError";
  }
}

export class CardNotFoundError extends CardDomainError {
  constructor(cardId: string, cause?: unknown) {
    super(`Cartão não encontrado: ${cardId}`, "CARD_NOT_FOUND", cause, { cardId });
  }
}

/**
 * Fatura/ciclo inválido ou referência inválida no fluxo de pagamento (ex.:
 * conta de pagamento inexistente ou de outro usuário).
 */
export class InvalidInvoiceError extends CardDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "INVALID_INVOICE", undefined, context);
  }
}
