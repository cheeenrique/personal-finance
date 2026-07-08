export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> =
  { success: true; data: T } | { success: false; error: ActionError };

export type SearchEntityKind = "transaction" | "account" | "card" | "category" | "tag";

/**
 * Resultado já pronto pra exibição (Command Palette, `components/layout/
 * command-palette.tsx`) — nenhum campo `Decimal` cru (React Flight não
 * serializa `Prisma.Decimal` de volta pro Client Component, ver
 * `components/cards/ui-actions.ts`), toda formatação de dinheiro/data feita
 * aqui no boundary do módulo.
 */
export type SearchResultItem = {
  kind: SearchEntityKind;
  id: string;
  /** Texto principal do resultado (descrição da transação, nome da conta/cartão/categoria/tag). */
  title: string;
  /** Contexto secundário opcional (ex.: valor + data da transação, bandeira do cartão). */
  subtitle?: string;
  /** Rota pra onde o clique no resultado navega. */
  href: string;
};
