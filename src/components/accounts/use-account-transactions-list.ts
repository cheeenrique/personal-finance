"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction, PaginatedResult, TransactionSort } from "@/modules/transactions/types";

/** Mesma paginação server-side (page/pageSize) da tela `/transactions` (`use-transactions-list.ts`) — ver `listFilterSchema`. */
const DEFAULT_PAGE_SIZE = 20;

const EMPTY_PAGE: PaginatedResult<ClientTransaction> = { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };

export type AccountTransactionsFilter = {
  accountId: string;
  search?: string;
  categoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  sort: TransactionSort;
  page: number;
};

type AccountTransactionsListData = {
  page: PaginatedResult<ClientTransaction>;
  installmentTotals: Map<string, number>;
};

/** 2ª ocorrência do fetch+merge de `installmentTotals` de `use-transactions-list.ts` (a 1ª) — aceitável (rule 02-dry-kiss-yagni: extrai na 3ª). */
async function fetchAccountTransactionsList(filter: AccountTransactionsFilter): Promise<AccountTransactionsListData> {
  const result = await listTransactionsAction({
    accountId: filter.accountId,
    search: filter.search,
    categoryId: filter.categoryId,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
    sort: filter.sort,
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
 * Busca o histórico de transações de UMA conta (docs/21-ACCOUNTS.md,
 * "Detalhe da Conta") — mesma Server Action + formato de dados de
 * `useTransactionsList` (`/transactions`), com filtro fixo em `accountId` em
 * vez do `TransactionFiltersState` completo (que carrega filtros que não
 * fazem sentido aqui, ex. origem/conta-cartão). Cache via TanStack Query,
 * chave própria (`account-transactions`) — não compartilha cache com
 * `/transactions` (filtros diferentes), `reload()` invalida só esta tela.
 */
export function useAccountTransactionsList(filter: AccountTransactionsFilter) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["account-transactions", filter],
    queryFn: () => fetchAccountTransactionsList(filter),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["account-transactions"] });
  }, [queryClient]);

  return {
    page: query.data?.page ?? EMPTY_PAGE,
    installmentTotals: query.data?.installmentTotals ?? new Map<string, number>(),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload,
  };
}
