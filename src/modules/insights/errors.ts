/**
 * Erros de domínio do módulo insights.
 *
 * Códigos tipados carregando contexto (nunca throw genérico) — ver
 * ~/.claude/rules/06-composition-errors.md. Mapeamento para HTTP/mensagem de
 * UI acontece no boundary (Server Component/Action), não aqui.
 *
 * Sem subclasses hoje: `healthScore`/`categoryTrends` são leitura pura (sem
 * "not found" possível — sempre há um resultado, mesmo que zerado) e
 * `monthlyNarrative` já modela falha como `null` (erro-como-dado), não como
 * exceção. Classe base fica pronta pro 1º caso concreto que precisar de um
 * código de erro tipado (~/.claude/rules/02-dry-kiss-yagni.md, YAGNI).
 */
export class InsightsDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "InsightsDomainError";
  }
}
