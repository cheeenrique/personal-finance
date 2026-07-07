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

/**
 * Pagamento maior que o saldo devedor atual do cartão (docs/22-CREDIT_CARDS.md,
 * Regra 1: "Cartão nunca pode ter saldo positivo") — pagar mais do que o
 * devedor deixaria o cartão credor, o que a regra proíbe.
 */
export class PaymentExceedsBalanceError extends CardDomainError {
  constructor(amount: string, outstandingBalance: string, cardId: string) {
    super(
      `Valor do pagamento (${amount}) excede o saldo devedor do cartão (${outstandingBalance})`,
      "PAYMENT_EXCEEDS_BALANCE",
      undefined,
      { cardId, amount, outstandingBalance },
    );
  }
}

/**
 * Operação de fatura/limite (CREDIT) chamada num cartão MEAL, ou `mealBalance`
 * chamado num cartão CREDIT — os dois tipos têm modelos de valor mutuamente
 * exclusivos (docs/22-CREDIT_CARDS.md não se aplica a MEAL: sem fatura, sem
 * ciclo, sem limite de crédito). Ver `service.ts` — cada função guarda seu
 * `card.type` esperado logo após `getCard`.
 */
export class CardTypeNotSupportedError extends CardDomainError {
  constructor(cardId: string, operation: string, requiredType: string) {
    super(
      `Operação "${operation}" não é suportada para este tipo de cartão (requer ${requiredType})`,
      "CARD_TYPE_NOT_SUPPORTED",
      undefined,
      { cardId, operation, requiredType },
    );
  }
}
