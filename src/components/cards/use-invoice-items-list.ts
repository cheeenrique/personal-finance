"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { TransactionType } from "@/generated/prisma/enums";
import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction, PaginatedResult } from "@/modules/transactions/types";

/** Mesma paginação server-side (page/pageSize) de `use-account-transactions-list.ts`. */
const DEFAULT_PAGE_SIZE = 20;

const EMPTY_PAGE: PaginatedResult<ClientTransaction> = { items: [], total: 0, page: 1, pageSize: DEFAULT_PAGE_SIZE };

export type InvoiceItemsFilter = {
  cardId: string;
  categoryId?: string;
  /**
   * Range do filtro de período segmentado acima da tabela (`use-card-period-filter.ts`,
   * "Mês atual"/"Mês passado"/"Personalizado") — `YYYY-MM-DD`, ambos
   * INCLUSIVOS (mesmo formato de `periodToRange`). `undefined` num dos lados
   * = sem limite. Não é mais o ciclo da fatura (`InvoiceView.periodStart`/
   * `periodEnd`) — a lista de compras virou período livre, independente do
   * fechamento do cartão (fonte visual: `Personal Finance - Cartoes.dc.html`,
   * segmented "Mês atual/Mês passado/Personalizado").
   */
  dateFrom?: string;
  dateTo?: string;
  page: number;
};

type InvoiceItemsListData = {
  page: PaginatedResult<ClientTransaction>;
  installmentTotals: Map<string, number>;
};

/** 3ª ocorrência do fetch+merge de `installmentTotals` (`use-transactions-list.ts`, `use-account-transactions-list.ts`) — extrair é o próximo passo (rule 02-dry-kiss-yagni), fora do escopo desta task. */
async function fetchInvoiceItemsList(filter: InvoiceItemsFilter): Promise<InvoiceItemsListData> {
  const result = await listTransactionsAction({
    cardId: filter.cardId,
    categoryId: filter.categoryId,
    // Só compras (`EXPENSE`) — sem este filtro, um `CARD_PAYMENT` do mesmo
    // cartão dentro do período (também tem `cardId` preenchido, ver
    // `modules/cards/pay-invoice.ts`) vazaria pra esta lista.
    type: TransactionType.EXPENSE,
    isPaid: true,
    dateFrom: filter.dateFrom,
    dateTo: filter.dateTo,
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
 * Busca as compras de UM cartão dentro do período selecionado no segmented
 * control acima da tabela (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão") —
 * mesma Server Action + formato de dados de `useAccountTransactionsList`
 * (`/accounts/[id]`), com filtro fixo em `cardId` em vez de `accountId`.
 * Cache via TanStack Query, chave própria (`invoice-items`) — não
 * compartilha cache com `/transactions`/`/accounts/[id]`, `reload()`
 * invalida só esta tela.
 */
export function useInvoiceItemsList(filter: InvoiceItemsFilter) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["invoice-items", filter],
    queryFn: () => fetchInvoiceItemsList(filter),
  });

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["invoice-items"] });
  }, [queryClient]);

  return {
    page: query.data?.page ?? EMPTY_PAGE,
    installmentTotals: query.data?.installmentTotals ?? new Map<string, number>(),
    loading: query.isLoading,
    error: query.error?.message ?? null,
    reload,
  };
}
