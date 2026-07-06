"use client";

import { useEffect, useState } from "react";

import { listAccountsAction } from "@/modules/accounts/actions";
import { listCardsAction } from "@/modules/cards/actions";
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

function flattenCategoryNames(nodes: CategoryTreeNode[]): [string, string][] {
  return nodes.flatMap((node) => [
    [node.id, node.name] as [string, string],
    ...flattenCategoryNames(node.children),
  ]);
}

export type TransactionsReferenceData = {
  loading: boolean;
  categoryOptions: EntitySelectOption[];
  originOptions: EntitySelectOption[];
  tags: Tag[];
  categoryNameById: Map<string, string>;
  accountNameById: Map<string, string>;
  cardNameById: Map<string, string>;
};

const EMPTY: TransactionsReferenceData = {
  loading: true,
  categoryOptions: [],
  originOptions: [],
  tags: [],
  categoryNameById: new Map(),
  accountNameById: new Map(),
  cardNameById: new Map(),
};

/**
 * Dados de apoio (categorias/contas/cartões/tags) da tela de Transações —
 * usados tanto nos dropdowns de filtro quanto na resolução de nome nas
 * colunas da tabela (a listagem só traz IDs, ver `modules/transactions/repository.ts`).
 * Carregado uma vez; a tela raramente muda esses cadastros durante o uso.
 */
export function useTransactionsReferenceData(): TransactionsReferenceData {
  const [data, setData] = useState<TransactionsReferenceData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    Promise.all([listCategoryTreeAction(), listAccountsAction(), listCardsAction(), listTagsAction()]).then(
      ([categoryResult, accountResult, cardResult, tagResult]) => {
        if (cancelled) return;

        const categories = categoryResult.success ? categoryResult.data : [];
        const accounts = accountResult.success ? accountResult.data : [];
        const cards = cardResult.success ? cardResult.data : [];
        const tags = tagResult.success ? tagResult.data : [];

        setData({
          loading: false,
          categoryOptions: flattenCategories(categories),
          originOptions: [
            ...accounts.map((account) => ({ value: `account:${account.id}`, label: account.name, group: "Contas" })),
            ...cards.map((card) => ({ value: `card:${card.id}`, label: card.name, group: "Cartões" })),
          ],
          tags,
          categoryNameById: new Map(flattenCategoryNames(categories)),
          accountNameById: new Map(accounts.map((account) => [account.id, account.name])),
          cardNameById: new Map(cards.map((card) => [card.id, card.name])),
        });
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return data;
}
