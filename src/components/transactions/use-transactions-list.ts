"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction, PaginatedResult, TransactionListSummary } from "@/modules/transactions/types";
import { buildServerFilter, type TransactionFiltersState } from "./use-transaction-filters";

const EMPTY_PAGE: PaginatedResult<ClientTransaction> = { items: [], total: 0, page: 1, pageSize: 20 };

/** `count` aqui é sempre igual a `page.total` — mesmo valor, nome próprio pro consumo direto no resumo da Faixa 3 (`TransactionFiltersBar`). */
const EMPTY_SUMMARY: TransactionListSummary<string> = { income: "0", expense: "0", net: "0", count: 0 };

type TransactionsListData = {
  page: PaginatedResult<ClientTransaction>;
  /** Agregado do MESMO filtro (todo o resultado, não só a página) — `listTransactionsAction`, ver `modules/transactions/service.ts`. */
  summary: TransactionListSummary<string>;
  installmentTotals: Map<string, number>;
};

/**
 * Busca a página + o agregado (income/expense/net/count) + os totais de
 * parcela (`installmentTotals`) numa única chamada — mantém a queryFn simples
 * (1 fetch em cache) em vez de múltiplas queries dependentes pra dados que
 * sempre são consumidos juntos na tela.
 */
async function fetchTransactionsList(filters: TransactionFiltersState): Promise<TransactionsListData> {
  const result = await listTransactionsAction(buildServerFilter(filters));
  if (!result.success) throw new Error(result.error.message);

  const { items, total, page, pageSize, income, expense, net, count } = result.data;

  const installmentPurchaseIds = [
    ...new Set(items.map((item) => item.installmentPurchaseId).filter((id): id is string => Boolean(id))),
  ];

  const installmentTotals =
    installmentPurchaseIds.length === 0
      ? new Map<string, number>()
      : await fetchInstallmentTotals(installmentPurchaseIds);

  return {
    page: { items, total, page, pageSize },
    summary: { income, expense, net, count },
    installmentTotals,
  };
}

async function fetchInstallmentTotals(installmentPurchaseIds: string[]): Promise<Map<string, number>> {
  const totalsResult = await getInstallmentTotalsAction(installmentPurchaseIds);
  return totalsResult.success ? new Map(Object.entries(totalsResult.data)) : new Map();
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
    summary: query.data?.summary ?? EMPTY_SUMMARY,
    installmentTotals: query.data?.installmentTotals ?? new Map<string, number>(),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload,
  };
}
