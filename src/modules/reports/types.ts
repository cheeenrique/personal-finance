import type { Prisma } from "@/generated/prisma/client";
import type { CardType, TransactionType } from "@/generated/prisma/enums";
import type { CategoryExpenseTotal } from "@/modules/transactions/types";
import type { TotalEvolutionPoint } from "@/modules/assets/types";

/** Dinheiro nunca é float no domínio — sempre Decimal (decimal.js via Prisma). */
export type Money = Prisma.Decimal;

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Ponto da série mensal receita x despesa — insumo do gráfico de linha/barra (docs/28-REPORTS.md, "Fluxo de Caixa"). */
export type IncomeExpenseMonthPoint = {
  year: number;
  month: number;
  income: Money;
  expense: Money;
};

/** Relatório por categoria — reaproveita o tipo já exposto por `modules/transactions` (mesma regra de exclusão). */
export type { CategoryExpenseTotal };

/** Entradas − saídas num período arbitrário (docs/28-REPORTS.md, "Relatório de Fluxo de Caixa"). */
export type CashflowReport = {
  dateFrom: Date;
  dateTo: Date;
  income: Money;
  expense: Money;
  net: Money;
};

/**
 * Movimentação por conta num período — CONTA Transfer e CARD_PAYMENT (regra
 * oposta à de receita/despesa, ver docs/28-REPORTS.md "Relatório por Conta").
 */
export type AccountMovementReport = {
  accountId: string;
  accountName: string;
  totalIn: Money;
  totalOut: Money;
  totalMovement: Money;
};

/** Evolução do patrimônio — reaproveita o tipo já exposto por `modules/assets`. */
export type { TotalEvolutionPoint };

/**
 * Filtros globais aplicáveis ao Fluxo de Caixa (12m, `cashflowByMonth`) e ao
 * Resumo do período (`cashflow`) — docs/28-REPORTS.md "Filtros Globais":
 * período (via `dateFrom`/`dateTo` ou `year`, já são parâmetros posicionais),
 * conta, categoria e tipo. `type === INCOME` restringe só à entrada;
 * `type === EXPENSE` restringe à saída, que agora inclui `CARD_PAYMENT`
 * (pagamento de fatura conta como saída de caixa, docs/28-REPORTS.md
 * "Exclusão de Transfer e Pagamento de Fatura") — sem double-count porque
 * compra no cartão fica fora até a fatura ser paga. Qualquer outro valor
 * (CARD_PAYMENT, TRANSFER, ou filtro não aplicado) mostra os dois lados
 * (entrada + saída) sem restringir por tipo.
 */
export type CashflowFilters = {
  accountId?: string;
  categoryId?: string;
  type?: TransactionType;
};

/**
 * Filtros do relatório "Por categoria" (`categoryTotals`) — período (via
 * `dateFrom`/`dateTo`) + conta + tipo. Tipo default é EXPENSE (mesma leitura
 * histórica do relatório, docs/28-REPORTS.md "Mostra gastos agrupados por
 * categoria"); só vira agrupamento de RECEITA quando o filtro pede
 * explicitamente INCOME — qualquer outro valor (undefined, EXPENSE,
 * CARD_PAYMENT, TRANSFER) cai no default, já que CARD_PAYMENT não tem
 * categoria (docs/24-CATEGORIES.md) e TRANSFER não é agrupável por categoria.
 */
export type CategoryTotalsFilters = {
  accountId?: string;
  type?: TransactionType;
};

/**
 * Nomes da categoria de pagamento de fatura — excluídos do donut/árvore
 * "Gastos por categoria" do Dashboard (docs/superpowers/specs/
 * 2026-07-08-gastos-por-categoria-arvore-design.md). Sem schema novo: a
 * fatura é o agregado das compras itemizadas no cartão; somar os dois
 * dobra o total. Frágil se o usuário renomear a categoria — aceito
 * deliberadamente (app escopada, sem migrar pra `CARD_PAYMENT` agora).
 */
export const CARD_INVOICE_CATEGORY_NAMES = ["Cartão de Crédito"] as const;

/** Pasta de um cartão na árvore de gastos (Dashboard) — total + categorias filhas. */
export type CardExpenseGroup = {
  cardId: string;
  cardName: string;
  cardType: CardType;
  total: Money;
  categories: CategoryExpenseTotal[];
};

/**
 * Árvore "Gastos por categoria" do Dashboard: cartões como pastas +
 * categorias de conta (sem `cardId`) flat. Cada real aparece uma vez
 * (fatura "Cartão de Crédito" excluída).
 */
export type ExpenseByCardTree = {
  cards: CardExpenseGroup[];
  accountCategories: CategoryExpenseTotal[];
};
