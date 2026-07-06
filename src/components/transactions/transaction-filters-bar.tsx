"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionType } from "@/generated/prisma/enums";
import { PERIOD_OPTIONS, type PeriodPreset } from "./period-presets";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";
import type { IsPaidFilter, OriginValue, TypeFilterValue } from "./use-transaction-filters";
import { cn } from "@/lib/utils";

const ALL_VALUE = "__ALL__";

const TYPE_OPTIONS: EntitySelectOption[] = [
  { value: ALL_VALUE, label: "Todos os tipos" },
  { value: TransactionType.INCOME, label: "Receita" },
  { value: TransactionType.EXPENSE, label: "Despesa" },
  { value: "TRANSFER", label: "Transferência" },
  { value: TransactionType.CARD_PAYMENT, label: "Pagamento de fatura" },
];

const IS_PAID_OPTIONS: { value: IsPaidFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pago" },
  { value: "pending", label: "Pendente" },
];

type TransactionFiltersBarProps = {
  type: TypeFilterValue | undefined;
  onTypeChange: (value: TypeFilterValue | undefined) => void;
  categoryId: string | undefined;
  onCategoryIdChange: (value: string | undefined) => void;
  origin: OriginValue | undefined;
  onOriginChange: (value: OriginValue | undefined) => void;
  period: PeriodPreset;
  onPeriodChange: (value: PeriodPreset) => void;
  tagId: string | undefined;
  onTagIdChange: (value: string | undefined) => void;
  isPaid: IsPaidFilter;
  onIsPaidChange: (value: IsPaidFilter) => void;
  referenceData: TransactionsReferenceData;
  hasActiveFilters: boolean;
  onClear: () => void;
};

/**
 * Dropdowns/chips extras da tela de Transações (busca + tabela já vêm do
 * `DataTable`, ver `transactions-view.tsx`). Inline no desktop (`lg:`),
 * colapsado num botão "Filtros" que abre um `Sheet` no mobile — nunca modal
 * complexo pra filtro simples (docs/06-SCREENS.md, "DataTable").
 */
export function TransactionFiltersBar(props: TransactionFiltersBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <FilterControls {...props} />
      </div>

      <div className="lg:hidden">
        <Button type="button" variant="outline" onClick={() => setMobileOpen(true)} className="gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filtros
          {props.hasActiveFilters && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </Button>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <FilterControls {...props} />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function FilterControls({
  type,
  onTypeChange,
  categoryId,
  onCategoryIdChange,
  origin,
  onOriginChange,
  period,
  onPeriodChange,
  tagId,
  onTagIdChange,
  isPaid,
  onIsPaidChange,
  referenceData,
  hasActiveFilters,
  onClear,
}: TransactionFiltersBarProps) {
  return (
    <>
      <EntitySelect
        options={TYPE_OPTIONS}
        value={type ?? ALL_VALUE}
        onValueChange={(value) => onTypeChange(value === ALL_VALUE ? undefined : (value as TypeFilterValue))}
        className="h-[38px] w-auto min-w-[150px]"
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
        options={PERIOD_OPTIONS}
        value={period}
        onValueChange={(value) => onPeriodChange(value as PeriodPreset)}
        className="h-[38px] w-auto min-w-[160px]"
      />

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todas as tags" }, ...referenceData.tags.map((tag) => ({ value: tag.id, label: tag.name }))]}
        value={tagId ?? ALL_VALUE}
        onValueChange={(value) => onTagIdChange(value === ALL_VALUE ? undefined : value)}
        className="h-[38px] w-auto min-w-[140px]"
        disabled={referenceData.loading}
      />

      <div className="flex h-[38px] items-center gap-1 rounded-[10px] border border-border bg-input p-1">
        {IS_PAID_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onIsPaidChange(option.value)}
            className={cn(
              "h-full rounded-[7px] px-2.5 text-[12.5px] font-bold transition-colors",
              isPaid === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="gap-1 text-muted-foreground">
          <X className="size-3.5" aria-hidden="true" />
          Limpar filtros
        </Button>
      )}
    </>
  );
}
