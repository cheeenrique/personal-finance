"use client";

import { useQuery } from "@tanstack/react-query";

import { listAccountOptionsAction, listCardOptionsAction } from "@/components/shared/entity-options-actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { listTagsAction } from "@/modules/tags/actions";
import type { CategoryTreeNode } from "@/modules/categories/types";
import type { Tag } from "@/modules/tags/types";
import type { EntitySelectOption } from "@/components/forms/entity-select";
import { CategoryType } from "@/generated/prisma/enums";

function flattenCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}`, group: node.type === CategoryType.INCOME ? "Receita" : "Despesa" },
    ...flattenCategories(node.children, depth + 1),
  ]);
}

/** Nome + cor da categoria — a bolinha da coluna "Categoria" precisa da cor, não só do nome (docs/04-DESIGN_SYSTEM.md, "Categoria"). */
export type CategoryRef = { name: string; color: string | null };

function flattenCategoryRefs(nodes: CategoryTreeNode[]): [string, CategoryRef][] {
  return nodes.flatMap((node) => [
    [node.id, { name: node.name, color: node.color }] as [string, CategoryRef],
    ...flattenCategoryRefs(node.children),
  ]);
}

export type TransactionsReferenceData = {
  loading: boolean;
  categoryOptions: EntitySelectOption[];
  originOptions: EntitySelectOption[];
  /** Contas puras (`value` = id sem prefixo) — selects dedicados de `CARD_PAYMENT` no `EditTransactionModal`, que não pode fundir conta/cartão num único `origin` (precisa dos dois ao mesmo tempo). */
  accountOptions: EntitySelectOption[];
  /** Cartões puros (`value` = id sem prefixo) — par de `accountOptions`, mesmo motivo. */
  cardOptions: EntitySelectOption[];
  tags: Tag[];
  categoryById: Map<string, CategoryRef>;
  accountNameById: Map<string, string>;
  cardNameById: Map<string, string>;
};

const EMPTY: Omit<TransactionsReferenceData, "loading"> = {
  categoryOptions: [],
  originOptions: [],
  accountOptions: [],
  cardOptions: [],
  tags: [],
  categoryById: new Map(),
  accountNameById: new Map(),
  cardNameById: new Map(),
};

/** Query key exportada — outras telas que criam cadastro (categoria/conta/cartão/tag) no fluxo de Transações podem invalidar este cache junto (nenhum fluxo desses existe hoje em `/transactions`, ver `entity-select.tsx`: `onCreate` não é usado aqui). */
export const TRANSACTIONS_REFERENCE_DATA_QUERY_KEY = ["transactions-reference-data"];

async function fetchTransactionsReferenceData(): Promise<Omit<TransactionsReferenceData, "loading">> {
  const [categoryResult, accountResult, cardResult, tagResult] = await Promise.all([
    listCategoryTreeAction(),
    listAccountOptionsAction(),
    listCardOptionsAction(),
    listTagsAction(),
  ]);

  const categories = categoryResult.success ? categoryResult.data : [];
  const accounts = accountResult.success ? accountResult.data : [];
  const cards = cardResult.success ? cardResult.data : [];
  const tags = tagResult.success ? tagResult.data : [];

  return {
    categoryOptions: flattenCategories(categories),
    originOptions: [
      ...accounts.map((account) => ({ value: `account:${account.id}`, label: account.name, group: "Contas" })),
      ...cards.map((card) => ({ value: `card:${card.id}`, label: card.name, group: "Cartões" })),
    ],
    accountOptions: accounts.map((account) => ({ value: account.id, label: account.name })),
    cardOptions: cards.map((card) => ({ value: card.id, label: card.name })),
    tags,
    categoryById: new Map(flattenCategoryRefs(categories)),
    accountNameById: new Map(accounts.map((account) => [account.id, account.name])),
    cardNameById: new Map(cards.map((card) => [card.id, card.name])),
  };
}

/**
 * Dados de apoio (categorias/contas/cartões/tags) da tela de Transações —
 * usados tanto nos dropdowns de filtro quanto na resolução de nome nas
 * colunas da tabela (a listagem só traz IDs, ver `modules/transactions/repository.ts`).
 *
 * Cache via TanStack Query com `staleTime` próprio (5min — mais alto que o
 * default de `QueryProvider`) porque categorias/contas/cartões/tags mudam
 * raramente durante uma sessão, diferente da lista de transações.
 */
export function useTransactionsReferenceData(): TransactionsReferenceData {
  const query = useQuery({
    queryKey: TRANSACTIONS_REFERENCE_DATA_QUERY_KEY,
    queryFn: fetchTransactionsReferenceData,
    staleTime: 5 * 60_000,
  });

  return { loading: query.isLoading, ...(query.data ?? EMPTY) };
}
