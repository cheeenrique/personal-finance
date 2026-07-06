"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction, PaginatedResult } from "@/modules/transactions/types";
import { buildServerFilter, type TransactionFiltersState } from "./use-transaction-filters";

const EMPTY_PAGE: PaginatedResult<ClientTransaction> = { items: [], total: 0, page: 1, pageSize: 20 };

type TransactionsListData = {
  page: PaginatedResult<ClientTransaction>;
  installmentTotals: Map<string, number>;
};

/**
 * Busca a página + os totais de parcela (`installmentTotals`) numa única
 * chamada — mantém a queryFn simples (1 fetch em cache) em vez de 2 queries
 * dependentes pra um dado que sempre é consumido junto na tabela.
 */
async function fetchTransactionsList(filters: TransactionFiltersState): Promise<TransactionsListData> {
  const result = await listTransactionsAction(buildServerFilter(filters));
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
 * Busca a página atual de transações (client-side, via Server Action — igual
 * ao restante do app, ver `NewTransactionForm`) + o total de parcelas de cada
 * `InstallmentPurchase` presente na página (pro badge "N/total").
 *
 * Cache via TanStack Query (`QueryProvider`, `staleTime` 1min): a mesma
 * combinação de filtros (`filters` inteiro entra na query key) só refaz o
 * fetch depois de 1min OU quando uma mutation invalida `["transactions"]`
 * explicitamente — `revalidatePath` do server action não alcança esse cache
 * client-side (ver `use-transaction-mutations.ts`).
 */
export function useTransactionsList(filters: TransactionFiltersState) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => fetchTransactionsList(filters),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["transactions"] });
  }, [queryClient]);

  return {
    page: query.data?.page ?? EMPTY_PAGE,
    installmentTotals: query.data?.installmentTotals ?? new Map<string, number>(),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload,
  };
}
