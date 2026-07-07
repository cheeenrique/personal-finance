"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction, PaginatedResult } from "@/modules/transactions/types";

/** Mesma paginação server-side (page/pageSize) de `use-account-transactions-list.ts`/`use-invoice-items-list.ts`. */
const DEFAULT_PAGE_SIZE = 20;

const EMPTY_PAGE: PaginatedResult<ClientTransaction> = { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };

export type CardTransactionsFilter = {
  cardId: string;
  page: number;
};

type CardTransactionsListData = {
  page: PaginatedResult<ClientTransaction>;
  installmentTotals: Map<string, number>;
};

async function fetchCardTransactionsList(filter: CardTransactionsFilter): Promise<CardTransactionsListData> {
  const result = await listTransactionsAction({
    cardId: filter.cardId,
    page: filter.page,
    pageSize: DEFAULT_PAGE_SIZE,
  });
  if (!result.success) throw new Error(result.error.message);

  const installmentPurchaseIds = [
    ...new Set(result.data.items.map((item) => item.installmentPurchaseId).filter((id): id is string => Boolean(id))),
  ];

  if (installmentPurchaseIds.length === 0) {
    return { page: result.data, installmentTotals: new Map() };
  }

  const totalsResult = await getInstallmentTotalsAction(installmentPurchaseIds);
  const installmentTotals = totalsResult.success ? new Map(Object.entries(totalsResult.data)) : new Map();

  return { page: result.data, installmentTotals };
}

/**
 * Movimentações (recargas + gastos) de UM cartão MEAL (feature sem doc
 * dedicado ainda — ver `modules/cards/service.ts` `computeMealBalance`).
 * Filtro fixo em `cardId`, sem `type`: recarga é `INCOME`, gasto é `EXPENSE`,
 * ambos aparecem juntos na mesma listagem — MEAL nunca tem `CARD_PAYMENT`
 * (não existe fatura pra pagar, ver `assertCreditCard`). Mesmo padrão de
 * `use-account-transactions-list.ts`/`use-invoice-items-list.ts`: cache via
 * TanStack Query, chave própria (`card-transactions`), `reload()` invalida só
 * esta tela.
 */
export function useCardTransactionsList(filter: CardTransactionsFilter) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["card-transactions", filter],
    queryFn: () => fetchCardTransactionsList(filter),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["card-transactions"] });
  }, [queryClient]);

  return {
    page: query.data?.page ?? EMPTY_PAGE,
    installmentTotals: query.data?.installmentTotals ?? new Map<string, number>(),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload,
  };
}
