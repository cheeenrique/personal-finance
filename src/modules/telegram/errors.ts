/**
 * Erros de domínio do módulo telegram.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. `message` é reaproveitada
 * diretamente como resposta ao usuário no bot (ver `reply.ts`/`handlers.ts`),
 * mesmo padrão de `actions.ts` nos outros módulos expondo `error.message` pra
 * UI autenticada — o chat_id allowlisted já É o dono dos dados.
 */
export class TelegramDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "TelegramDomainError";
  }
}

/** Nenhuma conta ativa cadastrada — lançamento rápido via Telegram precisa de uma origem (docs/03-DATABASE.md). */
export class NoActiveAccountError extends TelegramDomainError {
  constructor(userId: string) {
    super(
      "Nenhuma conta ativa configurada — cadastre uma conta no app antes de lançar pelo Telegram.",
      "NO_ACTIVE_ACCOUNT",
      undefined,
      { userId },
    );
  }
}

/** "Outros"/"Outros (Receita)" ausente pro usuário — não deveria acontecer com o seed padrão (docs/24-CATEGORIES.md). */
export class FallbackCategoryMissingError extends TelegramDomainError {
  constructor(userId: string, type: string) {
    super(
      "Categoria de fallback ausente para este usuário — verifique o seed de categorias.",
      "FALLBACK_CATEGORY_MISSING",
      undefined,
      { userId, type },
    );
  }
}
