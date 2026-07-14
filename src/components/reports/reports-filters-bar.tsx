"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TransactionType } from "@/generated/prisma/enums";
import { PERIOD_OPTIONS } from "@/components/transactions/period-presets";
import { useReportFilters } from "./use-report-filters";
import type { ReportTypeFilter } from "./report-filters";

const ALL_VALUE = "__ALL__";

const TYPE_OPTIONS: EntitySelectOption[] = [
  { value: ALL_VALUE, label: "Todos os tipos" },
  { value: TransactionType.INCOME, label: "Receita" },
  { value: TransactionType.EXPENSE, label: "Despesa" },
  { value: "TRANSFER", label: "Transferência" },
  { value: TransactionType.CARD_PAYMENT, label: "Pagamento de fatura" },
];

type ReportsFiltersBarProps = {
  categoryOptions: EntitySelectOption[];
  accountOptions: EntitySelectOption[];
  cardOptions: EntitySelectOption[];
};

/**
 * Filtros globais do topo de `/reports` (docs/06-SCREENS.md, "Relatórios"):
 * período, categoria, conta, cartão, tipo — aplicados a todas as seções da
 * tela (com as limitações documentadas em cada seção, já que nem todo
 * relatório aceita todo filtro no backend atual). Inline no desktop (`lg:`),
 * colapsado num `Sheet` no mobile — mesmo padrão de `TransactionFiltersBar`.
 */
export function ReportsFiltersBar({ categoryOptions, accountOptions, cardOptions }: ReportsFiltersBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const filters = useReportFilters();

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <FilterControls
          filters={filters}
          categoryOptions={categoryOptions}
          accountOptions={accountOptions}
          cardOptions={cardOptions}
        />
      </div>

      <div className="lg:hidden">
        <Button type="button" variant="outline" onClick={() => setMobileOpen(true)} className="gap-1.5">
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          Filtros
          {filters.hasActiveFilters && <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />}
        </Button>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Filtros</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4 pb-4">
              <FilterControls
                stacked
                filters={filters}
                categoryOptions={categoryOptions}
                accountOptions={accountOptions}
                cardOptions={cardOptions}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

type FilterControlsProps = {
  stacked?: boolean;
  filters: ReturnType<typeof useReportFilters>;
  categoryOptions: EntitySelectOption[];
  accountOptions: EntitySelectOption[];
  cardOptions: EntitySelectOption[];
};

/** Selects — desktop inline (`w-auto`), mobile empilhados no Sheet (`stacked`, `w-full`), mesmo padrão de `TransactionFiltersBar`. */
function FilterControls({ stacked, filters, categoryOptions, accountOptions, cardOptions }: FilterControlsProps) {
  const selectClassName = stacked ? "h-[38px] w-full" : "h-[38px] w-auto min-w-[160px]";
  const dateFieldClassName = stacked ? "h-[38px] w-full" : "h-[38px] w-[150px]";

  return (
    <>
      <EntitySelect
        options={PERIOD_OPTIONS}
        value={filters.state.period}
        onValueChange={(value) => filters.setPeriod(value as (typeof PERIOD_OPTIONS)[number]["value"])}
        className={selectClassName}
      />

      {filters.state.period === "custom" && (
        <div className={stacked ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2"}>
          <div className={stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5"}>
            <Label htmlFor="report-period-from" className="text-[12.5px] text-muted-foreground">
              De
            </Label>
            <DateField
              id="report-period-from"
              value={filters.state.customFrom ?? ""}
              onValueChange={filters.setCustomFrom}
              className={dateFieldClassName}
            />
          </div>
          <div className={stacked ? "flex flex-col gap-1.5" : "flex items-center gap-1.5"}>
            <Label htmlFor="report-period-to" className="text-[12.5px] text-muted-foreground">
              Até
            </Label>
            <DateField
              id="report-period-to"
              value={filters.state.customTo ?? ""}
              onValueChange={filters.setCustomTo}
              className={dateFieldClassName}
            />
          </div>
        </div>
      )}

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todas as categorias" }, ...categoryOptions]}
        value={filters.state.categoryId ?? ALL_VALUE}
        onValueChange={(value) => filters.setCategoryId(value === ALL_VALUE ? undefined : value)}
        className={stacked ? selectClassName : "h-[38px] w-auto min-w-[170px]"}
      />

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todas as contas" }, ...accountOptions]}
        value={filters.state.accountId ?? ALL_VALUE}
        onValueChange={(value) => filters.setAccountId(value === ALL_VALUE ? undefined : value)}
        className={selectClassName}
      />

      <EntitySelect
        options={[{ value: ALL_VALUE, label: "Todos os cartões" }, ...cardOptions]}
        value={filters.state.cardId ?? ALL_VALUE}
        onValueChange={(value) => filters.setCardId(value === ALL_VALUE ? undefined : value)}
        className={selectClassName}
      />

      <EntitySelect
        options={TYPE_OPTIONS}
        value={filters.state.type ?? ALL_VALUE}
        onValueChange={(value) => filters.setType(value === ALL_VALUE ? undefined : (value as ReportTypeFilter))}
        className={stacked ? selectClassName : "h-[38px] w-auto min-w-[150px]"}
      />

      {filters.hasActiveFilters && (
        <Button type="button" variant="ghost" size="sm" onClick={filters.clearAll} className="gap-1 text-muted-foreground">
          <X className="size-3.5" aria-hidden="true" />
          Limpar filtros
        </Button>
      )}
    </>
  );
}
