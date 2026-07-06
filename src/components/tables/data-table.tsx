"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, RefreshCw, Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTablePagination, type PaginationState } from "./data-table-pagination";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type DataTableColumn<T> = {
  key: string;
  header: string;
  align?: "left" | "right";
  sortable?: boolean;
  render: (row: T) => ReactNode;
};

export type SortState = { column: string; direction: "asc" | "desc" } | null;

type DataTableProps<T> = {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyState: {
    icon: LucideIcon;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  search?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Slot livre pra filtros por coluna — cada tela define os próprios dropdowns/popovers (docs/06-SCREENS.md). */
  filters?: ReactNode;
  sort?: SortState;
  onSortChange?: (column: string) => void;
  selection?: {
    selectedIds: string[];
    onChange: (ids: string[]) => void;
  };
  rowActions?: (row: T) => ReactNode;
  bulkActions?: (selectedIds: string[]) => ReactNode;
  /** Paginação server-side — só ligar em `/transactions` (única lista sem limite, docs/04-DESIGN_SYSTEM.md). */
  pagination?: PaginationState & { onPageChange: (page: number) => void };
};

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Componente único de tabela pra toda a aplicação (Transações, Contas,
 * Cartões, Categorias, Tags, Orçamentos, Assets, Parcelamentos, Alertas) —
 * mesmo comportamento em qualquer tela que o use (docs/06-SCREENS.md,
 * "DataTable"). Busca, filtros, ordenação, seleção, ações por linha/em massa,
 * paginação opcional. Estados: loading (skeleton) / empty / error / success.
 */
export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading = false,
  error = null,
  onRetry,
  emptyState,
  search,
  filters,
  sort,
  onSortChange,
  selection,
  rowActions,
  bulkActions,
  pagination,
}: DataTableProps<T>) {
  const [searchInput, setSearchInput] = useState(search?.value ?? "");

  useEffect(() => {
    if (!search) return;
    const timer = setTimeout(() => {
      if (searchInput !== search.value) search.onChange(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasSelection = Boolean(selection);
  const allSelected = hasSelection && data.length > 0 && selection!.selectedIds.length === data.length;
  const someSelected = hasSelection && selection!.selectedIds.length > 0 && !allSelected;

  function toggleAll() {
    if (!selection) return;
    selection.onChange(allSelected ? [] : data.map(getRowId));
  }

  function toggleRow(id: string) {
    if (!selection) return;
    const next = selection.selectedIds.includes(id)
      ? selection.selectedIds.filter((selectedId) => selectedId !== id)
      : [...selection.selectedIds, id];
    selection.onChange(next);
  }

  const columnCount = columns.length + (hasSelection ? 1 : 0) + (rowActions ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {(search || filters) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && (
            <div className="relative min-w-[220px] max-w-[340px] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={search.placeholder ?? "Buscar…"}
                className="h-[38px] rounded-[10px] pl-9"
              />
            </div>
          )}
          {filters}
        </div>
      )}

      {hasSelection && selection!.selectedIds.length > 0 && bulkActions && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
          <span className="font-semibold">{selection!.selectedIds.length} selecionada(s)</span>
          <div className="ml-auto flex items-center gap-2">{bulkActions(selection!.selectedIds)}</div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-left">
          <thead className="bg-background">
            <tr>
              {hasSelection && (
                <th scope="col" className="w-10 px-4 py-[11px]">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={toggleAll}
                    aria-label="Selecionar todas as linhas"
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-4 py-[11px] text-[11px] font-extrabold tracking-[0.05em] text-muted-foreground uppercase",
                    column.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {column.sortable && onSortChange ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(column.key)}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        FOCUS_RING_CLASS,
                      )}
                    >
                      {column.header}
                      <SortIcon active={sort?.column === column.key} direction={sort?.direction} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions && <th className="w-20 px-4 py-[11px] text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <SkeletonRows columnCount={columnCount} />
            ) : error ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-10">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm font-medium text-muted-foreground">{error}</p>
                    {onRetry && (
                      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                        <RefreshCw className="size-3.5" aria-hidden="true" />
                        Tentar novamente
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <EmptyState {...emptyState} className="rounded-none border-none" />
                </td>
              </tr>
            ) : (
              data.map((row) => {
                const id = getRowId(row);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "border-t border-border text-[13.5px] font-semibold transition-colors hover:bg-background",
                      selection?.selectedIds.includes(id) && "bg-primary/5",
                    )}
                  >
                    {hasSelection && (
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selection!.selectedIds.includes(id)}
                          onCheckedChange={() => toggleRow(id)}
                          aria-label="Selecionar linha"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn("px-4 py-3", column.align === "right" && "text-right")}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1.5">{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && !loading && !error && data.length > 0 && (
        <DataTablePagination {...pagination} />
      )}
    </div>
  );
}

function SortIcon({ active, direction }: { active?: boolean; direction?: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="size-3 opacity-50" aria-hidden="true" />;
  return direction === "asc" ? (
    <ArrowUp className="size-3" aria-hidden="true" />
  ) : (
    <ArrowDown className="size-3" aria-hidden="true" />
  );
}

function SkeletonRows({ columnCount }: { columnCount: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-border">
          {Array.from({ length: columnCount }).map((_, cellIndex) => (
            <td key={cellIndex} className="px-4 py-3">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
