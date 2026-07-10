"use client";

import { useQuery } from "@tanstack/react-query";

import { accountPeriodSummaryAction } from "@/modules/accounts/actions";
import type { AccountPeriodSummary } from "@/modules/accounts/types";

/** Query key própria (2ª ocorrência de sufixo "-summary" no módulo de contas, ver `use-account-transactions-list.ts` "account-transactions") — invalidada manualmente onde uma transação da conta muda (`account-overview.tsx` `reloadAll`, `import-modal.tsx` `handleConfirm`). */
export const ACCOUNT_PERIOD_SUMMARY_QUERY_KEY = "account-period-summary";

const EMPTY_SUMMARY: AccountPeriodSummary = { income: "0", expense: "0", incomeCount: 0, expenseCount: 0 };

export type AccountPeriodSummaryFilter = { accountId: string; dateFrom?: string; dateTo?: string };

async function fetchAccountPeriodSummary(filter: AccountPeriodSummaryFilter): Promise<AccountPeriodSummary> {
  const result = await accountPeriodSummaryAction(filter);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

/**
 * Agregado INCOME/EXPENSE do período selecionado (KPIs "Entradas/Saídas do
 * período" + resumo de fluxo, `AccountKpiRow`/`AccountFlowSummary`) —
 * independente da paginação da tabela (`useAccountTransactionsList`), consulta
 * própria (`accountPeriodSummaryAction`).
 */
export function useAccountPeriodSummary(filter: AccountPeriodSummaryFilter) {
  const query = useQuery({
    queryKey: [ACCOUNT_PERIOD_SUMMARY_QUERY_KEY, filter],
    queryFn: () => fetchAccountPeriodSummary(filter),
  });

  return {
    summary: query.data ?? EMPTY_SUMMARY,
    loading: query.isLoading,
    error: query.error?.message ?? null,
  };
}
