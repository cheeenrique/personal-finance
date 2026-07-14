"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, RefreshCw, Search } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
  /** Paginação server-side — usada em `/transactions` e no histórico de transações do detalhe de conta (`AccountTransactionsHistory`), as duas listas sem limite de itens (docs/04-DESIGN_SYSTEM.md). */
  pagination?: PaginationState & { onPageChange: (page: number) => void };
  /**
   * Opt-in: no desktop (`lg:`) estica a tabela pra altura disponível do
   * container pai (que precisa ter altura definida, ex.: `flex-1` num pai
   * `h-full`) com a paginação fixada na base. No mobile capa em ~10 linhas
   * (`max-h-[560px]`) com scroll vertical interno, em vez de esticar pro
   * viewport inteiro. Só usado em `/transactions` (única tela full-page com
   * `DataTable`).
   *
   * Sem esse flag (modo padrão, usado nas tabelas embutidas em cards/modais),
   * o desktop mantém altura por conteúdo (sem cap); o mobile também capa em
   * `max-h-[560px]` com scroll vertical interno (thead sticky só nesse
   * breakpoint) — decisão do dono: tabela no mobile nunca cresce
   * indefinidamente empurrando a página, ver memória `mobile-audit-standardization`.
   */
  fillHeight?: boolean;
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
  fillHeight = false,
}: DataTableProps<T>) {
  const [searchInput, setSearchInput] = useState(search?.value ?? "");

  /**
   * Resync quando `search.value` muda por uma fonte EXTERNA ao próprio debounce
   * abaixo — ex.: "Limpar filtros" zera `?q=` na URL, mas sem isso o termo
   * digitado ficava preso no input (F10, docs/50-AUDITORIA-BACKLOG.md).
   * "Adjusting state when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
   * feito durante o render — mesmo padrão de `new-transaction-form.tsx`/
   * `edit-transaction-modal.tsx`. Inofensivo pro fluxo normal de digitação: o
   * debounce só atualiza `search.value` DEPOIS que `searchInput` já bate com
   * ele, então o `if` abaixo não dispara de novo nesse caminho.
   */
  const [lastSyncedSearchValue, setLastSyncedSearchValue] = useState(search?.value ?? "");
  if (search && search.value !== lastSyncedSearchValue) {
    setLastSyncedSearchValue(search.value);
    setSearchInput(search.value);
  }

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
    <div className={cn("flex flex-col gap-3", fillHeight && "lg:h-full lg:min-h-0")}>
      {search && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
        </div>
      )}

      {/* Filtros numa linha própria (separada da busca): evita que os dois disputem o mesmo espaço e quebrem de forma confusa quando muitos filtros ficam ativos ao mesmo tempo. O agrupamento visual (painel) é decisão de quem preenche o slot, não do DataTable. */}
      {filters && <div className="shrink-0">{filters}</div>}

      {hasSelection && selection!.selectedIds.length > 0 && bulkActions && (
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm">
          <span className="font-semibold">{selection!.selectedIds.length} selecionada(s)</span>
          <div className="ml-auto flex items-center gap-2">{bulkActions(selection!.selectedIds)}</div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-xl border border-border bg-card",
          fillHeight && "lg:min-h-0 lg:flex-1",
        )}
      >
        <div
          className={cn(
            fillHeight
              ? "max-h-[560px] overflow-auto lg:max-h-none lg:min-h-0 lg:flex-1"
              : "max-h-[560px] overflow-auto lg:max-h-none lg:overflow-x-auto lg:overflow-y-visible",
          )}
        >
          <table className="w-full border-collapse text-left">
            <thead
              className={cn(
                "bg-background",
                fillHeight ? "sticky top-0 z-10" : "sticky top-0 z-10 lg:static",
              )}
            >
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
                <SkeletonRows columnCount={columnCount} rows={Math.min(pagination?.pageSize ?? 5, 10)} />
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
                        <td className="px-4 py-3.5">
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
                          className={cn("px-4 py-3.5", column.align === "right" && "text-right")}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                      {rowActions && (
                        <td className="px-4 py-3.5 text-right">
                          {/* Desktop: ações inline. Mobile (abaixo de sm:): colapsadas num menu
                              kebab pra não forçar scroll horizontal só pra alcançar os botões
                              (docs/50-AUDITORIA-BACKLOG.md, "Fase 3 — coluna de ações kebab"). */}
                          <div className="hidden justify-end gap-1.5 sm:flex">{rowActions(row)}</div>
                          <div className="flex justify-end sm:hidden">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <button
                                    type="button"
                                    aria-label="Ações"
                                    className={cn(
                                      "relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary",
                                      FOCUS_RING_CLASS,
                                    )}
                                  />
                                }
                              >
                                <MoreHorizontal className="size-[15px]" aria-hidden="true" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <div className="flex items-center gap-1.5 p-1">{rowActions(row)}</div>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
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
          <div className="shrink-0 border-t border-border">
            <DataTablePagination {...pagination} />
          </div>
        )}
      </div>
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

function SkeletonRows({ columnCount, rows }: { columnCount: number; rows: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-t border-border">
          {Array.from({ length: columnCount }).map((_, cellIndex) => (
            <td key={cellIndex} className="px-4 py-3.5">
              <Skeleton className="h-4 w-full max-w-32" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
