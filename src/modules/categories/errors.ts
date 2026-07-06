/**
 * Erros de domínio do módulo categories.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (actions.ts), não aqui.
 */
export class CategoryDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CategoryDomainError";
  }
}

export class CategoryNotFoundError extends CategoryDomainError {
  constructor(categoryId: string, cause?: unknown) {
    super(`Categoria não encontrada: ${categoryId}`, "CATEGORY_NOT_FOUND", cause, { categoryId });
  }
}

export class CategoryParentNotFoundError extends CategoryDomainError {
  constructor(parentId: string) {
    super(`Categoria pai não encontrada: ${parentId}`, "CATEGORY_PARENT_NOT_FOUND", undefined, { parentId });
  }
}

/** Filha deve ter o mesmo `type` do pai (docs/24-CATEGORIES.md, "Regra de Tipo": "filha nunca diverge do type do pai"). */
export class CategoryParentTypeMismatchError extends CategoryDomainError {
  constructor(parentId: string, parentType: string, childType: string) {
    super(
      `Categoria filha deve ter o mesmo tipo do pai (pai: ${parentType}, filha: ${childType})`,
      "CATEGORY_PARENT_TYPE_MISMATCH",
      undefined,
      { parentId, parentType, childType },
    );
  }
}

/** Categoria não pode ser pai dela mesma nem de um ancestral (cria loop na árvore). */
export class CategoryCycleError extends CategoryDomainError {
  constructor(categoryId: string, parentId: string) {
    super("Categoria não pode ser pai dela mesma nem de um ancestral", "CATEGORY_CYCLE", undefined, {
      categoryId,
      parentId,
    });
  }
}

/** Doc não define comportamento explícito — decisão do módulo: bloquear exclusão em vez de cascatear (mover é responsabilidade explícita do usuário). */
export class CategoryHasChildrenError extends CategoryDomainError {
  constructor(categoryId: string) {
    super(
      "Categoria possui subcategorias — mova ou remova as filhas antes de excluir",
      "CATEGORY_HAS_CHILDREN",
      undefined,
      { categoryId },
    );
  }
}

/** "Outros" (EXPENSE, raiz) é o fallback hardcoded do parser do Telegram — nunca pode ser excluído (docs/24-CATEGORIES.md + docs/30-TELEGRAM.md "Regra 2"). */
export class CategorySystemFallbackError extends CategoryDomainError {
  constructor(categoryId: string) {
    super(
      "Categoria 'Outros' é o fallback do parser do Telegram e não pode ser excluída",
      "CATEGORY_SYSTEM_FALLBACK",
      undefined,
      { categoryId },
    );
  }
}
