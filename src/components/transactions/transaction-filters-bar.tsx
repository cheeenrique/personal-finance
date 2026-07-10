"use client";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect } from "@/components/forms/entity-select";
import { Label } from "@/components/ui/label";
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

  const chips = buildActiveFilterChips(props);

  return (
    <div className={cn("flex flex-col gap-3.5 rounded-xl border border-border bg-card p-4", CARD_SHADOW_CLASS)}>
      <div className="flex flex-wrap items-center gap-3">
        <TransactionSearchField value={search} onChange={onSearchChange} />
        <TransactionIsPaidSegment value={isPaid} onChange={onIsPaidChange} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <EntitySelect
          options={TYPE_OPTIONS}
          value={type ?? ALL_VALUE}
          onValueChange={(value) => onTypeChange(value === ALL_VALUE ? undefined : (value as TypeFilterValue))}
          className="h-[38px] w-auto min-w-[160px]"
        />

        <EntitySelect
          options={[{ value: ALL_VALUE, label: "Todas as categorias" }, ...referenceData.categoryOptions]}
          value={categoryId ?? ALL_VALUE}
          onValueChange={(value) => onCategoryIdChange(value === ALL_VALUE ? undefined : value)}
          className="h-[38px] w-auto min-w-[170px]"
          disabled={referenceData.loading}
        />

        <EntitySelect
          options={[{ value: ALL_VALUE, label: "Todas as contas/cartões" }, ...referenceData.originOptions]}
          value={origin ?? ALL_VALUE}
          onValueChange={(value) => onOriginChange(value === ALL_VALUE ? undefined : (value as OriginValue))}
          className="h-[38px] w-auto min-w-[180px]"
          disabled={referenceData.loading}
        />

        <EntitySelect
          options={PERIOD_SELECT_OPTIONS}
          value={period}
          onValueChange={(value) => onPeriodChange(value as PeriodPreset)}
          className="h-[38px] w-auto min-w-[160px]"
        />

        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="tx-period-from" className="text-[12.5px] text-muted-foreground">
                De
              </Label>
              <DateField
                id="tx-period-from"
                value={customFrom ?? ""}
                onValueChange={onCustomFromChange}
                className="h-[38px] w-[150px]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="tx-period-to" className="text-[12.5px] text-muted-foreground">
                Até
              </Label>
              <DateField
                id="tx-period-to"
                value={customTo ?? ""}
                onValueChange={onCustomToChange}
                className="h-[38px] w-[150px]"
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
          className="h-[38px] w-auto min-w-[140px]"
          disabled={referenceData.loading}
        />
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
