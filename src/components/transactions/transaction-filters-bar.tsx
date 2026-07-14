"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect } from "@/components/forms/entity-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";
import { PERIOD_OPTIONS, type PeriodPreset } from "./period-presets";
import { ALL_VALUE, TYPE_OPTIONS, PERIOD_SELECT_OPTIONS } from "./transaction-filter-options";
import { TransactionSearchField, TransactionIsPaidSegment } from "./transaction-filters-search";
import { TransactionFiltersSummaryRow, type ActiveFilterChip } from "./transaction-filters-summary";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";
import type { IsPaidFilter, OriginValue, TypeFilterValue } from "./use-transaction-filters";
import type { TransactionListSummary } from "@/modules/transactions/types";

type TransactionFiltersBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  type: TypeFilterValue | undefined;
  onTypeChange: (value: TypeFilterValue | undefined) => void;
  categoryId: string | undefined;
  onCategoryIdChange: (value: string | undefined) => void;
  origin: OriginValue | undefined;
  onOriginChange: (value: OriginValue | undefined) => void;
  period: PeriodPreset;
  onPeriodChange: (value: PeriodPreset) => void;
  /** Só usados quando `period === "custom"` (docs/50-AUDITORIA-BACKLOG.md F12). */
  customFrom: string | undefined;
  onCustomFromChange: (value: string) => void;
  customTo: string | undefined;
  onCustomToChange: (value: string) => void;
  tagId: string | undefined;
  onTagIdChange: (value: string | undefined) => void;
  isPaid: IsPaidFilter;
  onIsPaidChange: (value: IsPaidFilter) => void;
  referenceData: TransactionsReferenceData;
  hasActiveFilters: boolean;
  onClear: () => void;
  /** Agregado do resultado filtrado (todo o resultado, não só a página carregada) — ver `use-transactions-list.ts`. */
  summary: TransactionListSummary<string>;
  summaryLoading: boolean;
};

/**
 * Card de filtros ricos da tela de Transações (docs/06-SCREENS.md,
 * "Transações"): Faixa 1 (busca + segmentado Todos/Pago/Pendente), Faixa 2
 * (selects Tipo/Categoria/Conta-Cartão/Período/Tags) e Faixa 3 (chips
 * removíveis + resumo do resultado filtrado, ver `TransactionFiltersSummaryRow`).
 * A busca vive aqui (não mais no `DataTable`) mas usa o MESMO estado
 * (`search`/`onSearchChange` = `filters.state.q`/`filters.setQuery`) — o
 * `DataTable` não recebe mais a prop `search` nesta tela (ver `transactions-view.tsx`).
 */
export function TransactionFiltersBar(props: TransactionFiltersBarProps) {
  const {
    search,
    onSearchChange,
    type,
    onTypeChange,
    categoryId,
    onCategoryIdChange,
    origin,
    onOriginChange,
    period,
    onPeriodChange,
    customFrom,
    onCustomFromChange,
    customTo,
    onCustomToChange,
    tagId,
    onTagIdChange,
    isPaid,
    onIsPaidChange,
    referenceData,
    hasActiveFilters,
    onClear,
    summary,
    summaryLoading,
  } = props;

  const [mobileOpen, setMobileOpen] = useState(false);
  const chips = buildActiveFilterChips(props);

  return (
    <div className={cn("flex flex-col gap-3.5 rounded-xl border border-border bg-card p-4", CARD_SHADOW_CLASS)}>
      <div className="flex flex-wrap items-center gap-3">
        <TransactionSearchField value={search} onChange={onSearchChange} />
        <TransactionIsPaidSegment value={isPaid} onChange={onIsPaidChange} />
      </div>

      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <FilterSelects
          type={type}
          onTypeChange={onTypeChange}
          categoryId={categoryId}
          onCategoryIdChange={onCategoryIdChange}
          origin={origin}
          onOriginChange={onOriginChange}
          period={period}
          onPeriodChange={onPeriodChange}
          customFrom={customFrom}
          onCustomFromChange={onCustomFromChange}
          customTo={customTo}
          onCustomToChange={onCustomToChange}
          tagId={tagId}
          onTagIdChange={onTagIdChange}
          referenceData={referenceData}
        />
      </div>

      <div className="lg:hidden">
        <Button type="button" variant="outline" onClick={() => setMobileOpen(true)} className="gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filtros
          {hasActiveFilters && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </Button>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <FilterSelects
                stacked
                type={type}
                onTypeChange={onTypeChange}
                categoryId={categoryId}
                onCategoryIdChange={onCategoryIdChange}
                origin={origin}
                onOriginChange={onOriginChange}
                period={period}
                onPeriodChange={onPeriodChange}
                customFrom={customFrom}
                onCustomFromChange={onCustomFromChange}
                customTo={customTo}
                onCustomToChange={onCustomToChange}
                tagId={tagId}
                onTagIdChange={onTagIdChange}
                referenceData={referenceData}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <TransactionFiltersSummaryRow
        chips={chips}
        hasActiveFilters={hasActiveFilters}
        onClear={onClear}
        summary={summary}
        loading={summaryLoading}
      />
    </div>
  );
}

type FilterSelectsProps = {
  stacked?: boolean;
  type: TypeFilterValue | undefined;
  onTypeChange: (value: TypeFilterValue | undefined) => void;
  categoryId: string | undefined;
  onCategoryIdChange: (value: string | undefined) => void;
  origin: OriginValue | undefined;
  onOriginChange: (value: OriginValue | undefined) => void;
  period: PeriodPreset;
  onPeriodChange: (value: PeriodPreset) => void;
  customFrom: string | undefined;
  onCustomFromChange: (value: string) => void;
  customTo: string | undefined;
  onCustomToChange: (value: string) => void;
  tagId: string | undefined;
  onTagIdChange: (value: string | undefined) => void;
  referenceData: TransactionsReferenceData;
};

/** Faixa 2 (selects) — desktop inline (`w-auto`), mobile empilhada no Sheet (`stacked`, `w-full`). */
function FilterSelects({
  stacked,
  type,
  onTypeChange,
  categoryId,
  onCategoryIdChange,
  origin,
  onOriginChange,
  period,
  onPeriodChange,
  customFrom,
  onCustomFromChange,
  customTo,
  onCustomToChange,
  tagId,
  onTagIdChange,
  referenceData,
}: FilterSelectsProps) {
  const selectClassName = stacked ? "h-[38px] w-full" : "h-[38px] w-auto min-w-[160px]";
  const dateFieldClassName = stacked ? "h-[38px] w-full" : "h-[38px] w-[150px]";

  return (
    <>
      <EntitySelect
        options={TYPE_OPTIONS}
        value={type ?? ALL_VALUE}
        onValueChange={(value) => onTypeChange(value === ALL_VALUE ? undefined : (value as TypeFilterValue))}
        className={selectClassName}
      />

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todas as categorias" }, ...referenceData.categoryOptions]}
        value={categoryId ?? ALL_VALUE}
        onValueChange={(value) => onCategoryIdChange(value === ALL_VALUE ? undefined : value)}
        className={stacked ? selectClassName : "h-[38px] w-auto min-w-[170px]"}
        disabled={referenceData.loading}
      />

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todas as contas/cartões" }, ...referenceData.originOptions]}
        value={origin ?? ALL_VALUE}
        onValueChange={(value) => onOriginChange(value === ALL_VALUE ? undefined : (value as OriginValue))}
        className={stacked ? selectClassName : "h-[38px] w-auto min-w-[180px]"}
        disabled={referenceData.loading}
      />

      <EntitySelect
        options={PERIOD_SELECT_OPTIONS}
        value={period}
        onValueChange={(value) => onPeriodChange(value as PeriodPreset)}
        className={selectClassName}
      />

      {period === "custom" && (
        <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
          <div className={stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5"}>
            <Label htmlFor="tx-period-from" className="text-[12.5px] text-muted-foreground">
              De
            </Label>
            <DateField
              id="tx-period-from"
              value={customFrom ?? ""}
              onValueChange={onCustomFromChange}
              className={dateFieldClassName}
            />
          </div>
          <div className={stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5"}>
            <Label htmlFor="tx-period-to" className="text-[12.5px] text-muted-foreground">
              Até
            </Label>
            <DateField
              id="tx-period-to"
              value={customTo ?? ""}
              onValueChange={onCustomToChange}
              className={dateFieldClassName}
            />
          </div>
        </div>
      )}

      <EntitySelect
        options={[
          { value: ALL_VALUE, label: "Todas as tags" },
          ...referenceData.tags.map((tag) => ({ value: tag.id, label: tag.name })),
        ]}
        value={tagId ?? ALL_VALUE}
        onValueChange={(value) => onTagIdChange(value === ALL_VALUE ? undefined : value)}
        className={stacked ? selectClassName : "h-[38px] w-auto min-w-[140px]"}
        disabled={referenceData.loading}
      />
    </>
  );
}

/** Monta os chips removíveis da Faixa 3 a partir do estado atual dos filtros — 1 chip por filtro ativo, na mesma ordem visual dos selects da Faixa 2. */
function buildActiveFilterChips(props: TransactionFiltersBarProps): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];

  if (props.type) {
    const label = TYPE_OPTIONS.find((option) => option.value === props.type)?.label ?? props.type;
    chips.push({ key: "type", label: `Tipo: ${label}`, onRemove: () => props.onTypeChange(undefined) });
  }
  if (props.categoryId) {
    const label = props.referenceData.categoryOptions.find((option) => option.value === props.categoryId)?.label;
    chips.push({
      key: "category",
      label: `Categoria: ${label ?? "—"}`,
      onRemove: () => props.onCategoryIdChange(undefined),
    });
  }
  if (props.origin) {
    const label = props.referenceData.originOptions.find((option) => option.value === props.origin)?.label;
    chips.push({
      key: "origin",
      label: `Conta/Cartão: ${label ?? "—"}`,
      onRemove: () => props.onOriginChange(undefined),
    });
  }
  if (props.period !== "all") {
    const label = PERIOD_OPTIONS.find((option) => option.value === props.period)?.label ?? props.period;
    chips.push({ key: "period", label, onRemove: () => props.onPeriodChange("all") });
  }
  if (props.tagId) {
    const label = props.referenceData.tags.find((tag) => tag.id === props.tagId)?.name;
    chips.push({ key: "tag", label: `Tag: ${label ?? "—"}`, onRemove: () => props.onTagIdChange(undefined) });
  }
  if (props.isPaid !== "all") {
    const label = props.isPaid === "paid" ? "Pago" : "Pendente";
    chips.push({ key: "isPaid", label, onRemove: () => props.onIsPaidChange("all") });
  }
  if (props.search.trim()) {
    chips.push({
      key: "search",
      label: `Busca: "${props.search.trim()}"`,
      onRemove: () => props.onSearchChange(""),
    });
  }

  return chips;
}
