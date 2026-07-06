"use client";

import { useCallback, useEffect, useState } from "react";

import { getInstallmentTotalsAction, listTransactionsAction } from "@/modules/transactions/actions";
import type { ClientTransaction } from "@/modules/transactions/types";
import { buildServerFilter, type TransactionFiltersState } from "./use-transaction-filters";

const EMPTY_PAGE = { items: [] as ClientTransaction[], total: 0, page: 1, pageSize: 20 };

/**
 * Busca a página atual de transações (client-side, via Server Action — igual
 * ao restante do app, ver `NewTransactionForm`) + o total de parcelas de cada
 * `InstallmentPurchase` presente na página (pro badge "N/total").
 * `revalidatePath` do server action não invalida esse fetch client-side —
 * mutations chamam `reload()` explicitamente (ver `transactions-view.tsx`).
 */
export function useTransactionsList(filters: TransactionFiltersState) {
  const [page, setPageData] = useState(EMPTY_PAGE);
  const [installmentTotals, setInstallmentTotals] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await listTransactionsAction(buildServerFilter(filters));
      if (cancelled) return;

      if (!result.success) {
        setError(result.error.message);
        setLoading(false);
        return;
      }

      setPageData(result.data);
      setLoading(false);

      const installmentPurchaseIds = [
        ...new Set(result.data.items.map((item) => item.installmentPurchaseId).filter((id): id is string => Boolean(id))),
      ];

      if (installmentPurchaseIds.length === 0) {
        setInstallmentTotals(new Map());
        return;
      }

      const totalsResult = await getInstallmentTotalsAction(installmentPurchaseIds);
      if (!cancelled && totalsResult.success) {
        setInstallmentTotals(new Map(Object.entries(totalsResult.data)));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [filters, reloadToken]);

  return { page, installmentTotals, loading, error, reload };
}
