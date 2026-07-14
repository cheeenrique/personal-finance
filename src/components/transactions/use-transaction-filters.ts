"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { TransactionType } from "@/generated/prisma/enums";
import type { SortState } from "@/components/tables/data-table";
import type { TransactionSort } from "@/modules/transactions/types";
import { periodToRange, type PeriodPreset } from "./period-presets";

/** Origem combinada (conta OU cartão) — mesma convenção do `NewTransactionForm`. */
export type OriginValue = `account:${string}` | `card:${string}`;

export type IsPaidFilter = "all" | "paid" | "pending";

/** Valor do dropdown "Tipo" — `TRANSFER` aqui é só rótulo de UI (ver `schemas.ts`, "isTransfer"). */
export type TypeFilterValue = TransactionType | "TRANSFER";

const DEFAULT_PAGE_SIZE = 20;

export type TransactionFiltersState = {
  q: string;
  type: TypeFilterValue | undefined;
  categoryId: string | undefined;
  origin: OriginValue | undefined;
  period: PeriodPreset;
  /** Só usados quando `period === "custom"` (docs/50-AUDITORIA-BACKLOG.md F12) — persistidos em `?dateFrom=&dateTo=`. */
  customFrom: string | undefined;
  customTo: string | undefined;
  tagId: string | undefined;
  isPaid: IsPaidFilter;
  page: number;
  sort: SortState;
};

const SORT_COLUMN_MAP: Record<TransactionSort, SortState> = {
  date_desc: { column: "date", direction: "desc" },
  date_asc: { column: "date", direction: "asc" },
  amount_desc: { column: "amount", direction: "desc" },
  amount_asc: { column: "amount", direction: "asc" },
};

function sortStateToParam(sort: SortState): TransactionSort {
  if (!sort) return "date_desc";
  const key = `${sort.column}_${sort.direction}` as TransactionSort;
  return key in SORT_COLUMN_MAP ? key : "date_desc";
}

function parseState(params: URLSearchParams): TransactionFiltersState {
  const sortParam = (params.get("sort") ?? "date_desc") as TransactionSort;
  const isPaidParam = params.get("isPaid");

  return {
    q: params.get("q") ?? "",
    type: (params.get("type") as TypeFilterValue) ?? undefined,
    categoryId: params.get("categoryId") ?? undefined,
    origin: (params.get("origin") as OriginValue) ?? undefined,
    period: (params.get("period") as PeriodPreset) ?? "this_month",
    customFrom: params.get("dateFrom") ?? undefined,
    customTo: params.get("dateTo") ?? undefined,
    tagId: params.get("tagId") ?? undefined,
    isPaid: isPaidParam === "paid" || isPaidParam === "pending" ? isPaidParam : "all",
    page: Number(params.get("page") ?? "1") || 1,
    sort: SORT_COLUMN_MAP[sortParam] ?? SORT_COLUMN_MAP.date_desc,
  };
}

/**
 * Filtros da tela de Transações persistidos na URL (`?q=...&type=...`) —
 * shareable, sobrevive a refresh, sem estado escondido em memória (docs
 * do módulo pedem "persistência de filtros na sessão"). Cada `set*` já
 * volta a `page=1` (nova busca invalida a paginação atual).
 */
export function useTransactionFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo(() => parseState(searchParams), [searchParams]);

  const replace = useCallback(
    (next: Partial<TransactionFiltersState>, options?: { resetPage?: boolean }) => {
      const params = new URLSearchParams(searchParams.toString());
      // `next.page` (ex.: clique na paginação) sempre vence — só cai pro reset
      // pra 1 quando quem chamou não informou página nenhuma.
      const nextPage = next.page ?? (options?.resetPage === false ? state.page : 1);
      const merged = { ...state, ...next, page: nextPage };

      const entries: [string, string | undefined][] = [
        ["q", merged.q || undefined],
        ["type", merged.type],
        ["categoryId", merged.categoryId],
        ["origin", merged.origin],
        ["period", merged.period === "this_month" ? undefined : merged.period],
        ["dateFrom", merged.period === "custom" ? merged.customFrom : undefined],
        ["dateTo", merged.period === "custom" ? merged.customTo : undefined],
        ["tagId", merged.tagId],
        ["isPaid", merged.isPaid === "all" ? undefined : merged.isPaid],
        ["page", merged.page > 1 ? String(merged.page) : undefined],
        ["sort", sortStateToParam(merged.sort) === "date_desc" ? undefined : sortStateToParam(merged.sort)],
      ];

      for (const [key, value] of entries) {
        if (value) params.set(key, value);
        else params.delete(key);
      }

      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, state],
  );

  const setPage = useCallback((page: number) => replace({ page }, { resetPage: false }), [replace]);
  const setSort = useCallback((sort: SortState) => replace({ sort }), [replace]);
  const setQuery = useCallback((q: string) => replace({ q }), [replace]);
  const setType = useCallback((type: TypeFilterValue | undefined) => replace({ type }), [replace]);
  const setCategoryId = useCallback((categoryId: string | undefined) => replace({ categoryId }), [replace]);
  const setOrigin = useCallback((origin: OriginValue | undefined) => replace({ origin }), [replace]);
  const setPeriod = useCallback((period: PeriodPreset) => replace({ period }), [replace]);
  const setCustomFrom = useCallback((customFrom: string | undefined) => replace({ customFrom }), [replace]);
  const setCustomTo = useCallback((customTo: string | undefined) => replace({ customTo }), [replace]);
  const setTagId = useCallback((tagId: string | undefined) => replace({ tagId }), [replace]);
  const setIsPaid = useCallback((isPaid: IsPaidFilter) => replace({ isPaid }), [replace]);

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  const hasActiveFilters = Boolean(
    state.q || state.type || state.categoryId || state.origin || state.period !== "this_month" || state.tagId || state.isPaid !== "all",
  );

  return {
    state,
    setPage,
    setSort,
    setQuery,
    setType,
    setCategoryId,
    setOrigin,
    setPeriod,
    setCustomFrom,
    setCustomTo,
    setTagId,
    setIsPaid,
    clearAll,
    hasActiveFilters,
  };
}

/** Converte o estado de filtros da UI pro formato aceito por `listTransactionsAction` (ver `listFilterSchema`). */
export function buildServerFilter(state: TransactionFiltersState, pageSize = DEFAULT_PAGE_SIZE) {
  const [originKind, originId] = state.origin?.split(":") ?? [undefined, undefined];
  const { dateFrom, dateTo } = periodToRange(state.period, { dateFrom: state.customFrom, dateTo: state.customTo });

  return {
    search: state.q || undefined,
    type: state.type && state.type !== "TRANSFER" ? state.type : undefined,
    isTransfer: state.type === "TRANSFER" ? true : undefined,
    categoryId: state.categoryId,
    accountId: originKind === "account" ? originId : undefined,
    cardId: originKind === "card" ? originId : undefined,
    dateFrom,
    dateTo,
    tagId: state.tagId,
    isPaid: state.isPaid === "all" ? undefined : state.isPaid === "paid",
    page: state.page,
    pageSize,
    sort: sortStateToParam(state.sort),
  };
}
