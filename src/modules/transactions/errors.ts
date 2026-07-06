/**
 * Erros de domínio do módulo transactions.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class TransactionDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TransactionDomainError";
  }
}

export class TransactionNotFoundError extends TransactionDomainError {
  constructor(transactionId: string, cause?: unknown) {
    super(`Transação não encontrada: ${transactionId}`, "TRANSACTION_NOT_FOUND", cause, {
      transactionId,
    });
  }
}

/**
 * Origem inválida: nem conta nem cartão informados (ou ambos), ou a conta/
 * cartão referenciado não existe/não pertence ao usuário.
 */
export class InvalidSourceError extends TransactionDomainError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "INVALID_SOURCE", undefined, context);
  }
}

export class CategoryNotFoundError extends TransactionDomainError {
  constructor(categoryId: string) {
    super(`Categoria não encontrada: ${categoryId}`, "CATEGORY_NOT_FOUND", undefined, { categoryId });
  }
}

export class CategoryRequiredError extends TransactionDomainError {
  constructor() {
    super("Categoria é obrigatória para este tipo de transação", "CATEGORY_REQUIRED");
  }
}

export class CategoryNotAllowedError extends TransactionDomainError {
  constructor() {
    super("Pagamento de fatura não usa categoria", "CATEGORY_NOT_ALLOWED");
  }
}

/** Categoria existe e pertence ao usuário, mas o `type` dela não bate com o da transação (ver docs/24-CATEGORIES.md). */
export class CategoryTypeMismatchError extends TransactionDomainError {
  constructor(categoryId: string) {
    super("Categoria não é compatível com o tipo da transação", "CATEGORY_TYPE_MISMATCH", undefined, {
      categoryId,
    });
  }
}

export class TagNotFoundError extends TransactionDomainError {
  constructor(tagIds: string[]) {
    super("Uma ou mais tags não foram encontradas", "TAG_NOT_FOUND", undefined, { tagIds });
  }
}

export class InstallmentInvalidCountError extends TransactionDomainError {
  constructor(installmentsCount: number) {
    super("Número de parcelas inválido — mínimo 2", "INSTALLMENT_INVALID_COUNT", undefined, {
      installmentsCount,
    });
  }
}
