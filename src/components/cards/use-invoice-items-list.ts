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
  /** Ciclo da fatura atual — mesmo shape ISO de `InvoiceView`. `periodEnd` é EXCLUSIVO (ver `modules/cards/cycle.ts` `cycleContaining`). */
  periodStart: string;
  periodEnd: string;
  page: number;
};

type InvoiceItemsListData = {
  page: PaginatedResult<ClientTransaction>;
  installmentTotals: Map<string, number>;
};

/**
 * `cycle.periodEnd` é EXCLUSIVO (`cycleContaining`: "uma compra feita NO
 * PRÓPRIO dia de fechamento já pertence ao PRÓXIMO ciclo") — é como
 * `cardService.buildInvoice`/`findExpensesInRange` consulta (`lt: periodEnd`).
 * `listFilterSchema.dateTo`, porém, é INCLUSIVO (`lte`, ver
 * `modules/transactions/repository.ts` `buildWhere`). Subtrai 1ms pra manter
 * a mesma fronteira de ciclo sem duplicar a regra de fechamento aqui — só
 * converte o formato entre os dois filtros.
 */
function toInclusiveDateTo(periodEndIso: string): string {
  return new Date(new Date(periodEndIso).getTime() - 1).toISOString();
}

/** 3ª ocorrência do fetch+merge de `installmentTotals` (`use-transactions-list.ts`, `use-account-transactions-list.ts`) — extrair é o próximo passo (rule 02-dry-kiss-yagni), fora do escopo desta task. */
async function fetchInvoiceItemsList(filter: InvoiceItemsFilter): Promise<InvoiceItemsListData> {
  const result = await listTransactionsAction({
    cardId: filter.cardId,
    // `findExpensesInRange` só considera compras (`EXPENSE`) — sem este filtro,
    // um `CARD_PAYMENT` do mesmo cartão dentro do ciclo (também tem `cardId`
    // preenchido, ver `modules/cards/pay-invoice.ts`) vazaria pra esta lista.
    type: TransactionType.EXPENSE,
    isPaid: true,
    dateFrom: filter.periodStart,
    dateTo: toInclusiveDateTo(filter.periodEnd),
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
 * Busca as compras da fatura ATUAL de UM cartão (docs/22-CREDIT_CARDS.md,
 * "Detalhe do Cartão") — mesma Server Action + formato de dados de
 * `useAccountTransactionsList` (`/accounts/[id]`), com filtro fixo em
 * `cardId` + range do ciclo atual em vez de `accountId` + período livre.
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
