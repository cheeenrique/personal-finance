"use client";

import { useEffect, useState } from "react";

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
  tags: Tag[];
  categoryById: Map<string, CategoryRef>;
  accountNameById: Map<string, string>;
  cardNameById: Map<string, string>;
};

const EMPTY: TransactionsReferenceData = {
  loading: true,
  categoryOptions: [],
  originOptions: [],
  tags: [],
  categoryById: new Map(),
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

    Promise.all([listCategoryTreeAction(), listAccountOptionsAction(), listCardOptionsAction(), listTagsAction()]).then(
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
          categoryById: new Map(flattenCategoryRefs(categories)),
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
