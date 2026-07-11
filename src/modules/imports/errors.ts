/**
 * Erros de domínio do módulo imports.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui. Erros de PARSE do arquivo
 * OFX (bloco sem valor/data, etc.) não entram aqui — são dados, não
 * exceções, retornados como `ImportParseError[]` no resultado (ver types.ts).
 */
export class ImportDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ImportDomainError";
  }
}

/** Conta informada não existe ou não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança"). */
export class AccountNotFoundError extends ImportDomainError {
  constructor(accountId: string) {
    super(`Conta não encontrada: ${accountId}`, "ACCOUNT_NOT_FOUND", undefined, { accountId });
  }
}

/** Cartão informado não existe ou não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança") — espelha `AccountNotFoundError` acima pro target `{kind:"card"}`. */
export class CardNotFoundError extends ImportDomainError {
  constructor(cardId: string) {
    super(`Cartão não encontrado: ${cardId}`, "CARD_NOT_FOUND", undefined, { cardId });
  }
}
