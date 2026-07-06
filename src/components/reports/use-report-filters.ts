"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { PeriodPreset } from "@/components/transactions/period-presets";
import {
  hasActiveReportFilters,
  parseReportFilters,
  reportFilterEntries,
  type ReportFiltersState,
  type ReportTypeFilter,
} from "./report-filters";

/**
 * Filtros globais de `/reports` persistidos na URL — mesma convenção de
 * `useTransactionFilters` (shareable, sobrevive a refresh). Sem paginação/
 * busca/sort: relatórios não são uma lista, são leituras agregadas.
 */
export function useReportFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => parseReportFilters((key) => searchParams.get(key)), [searchParams]);

  const replace = useCallback(
    (next: Partial<ReportFiltersState>) => {
      const params = new URLSearchParams(searchParams.toString());
      const merged = { ...state, ...next };

      for (const [key, value] of reportFilterEntries(merged)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, state],
  );

  const setPeriod = useCallback((period: PeriodPreset) => replace({ period }), [replace]);
  const setCategoryId = useCallback((categoryId: string | undefined) => replace({ categoryId }), [replace]);
  const setAccountId = useCallback((accountId: string | undefined) => replace({ accountId }), [replace]);
  const setCardId = useCallback((cardId: string | undefined) => replace({ cardId }), [replace]);
  const setType = useCallback((type: ReportTypeFilter | undefined) => replace({ type }), [replace]);
  const clearAll = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  return {
    state,
    setPeriod,
    setCategoryId,
    setAccountId,
    setCardId,
    setType,
    clearAll,
    hasActiveFilters: hasActiveReportFilters(state),
  };
}
