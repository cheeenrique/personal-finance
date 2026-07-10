"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TransactionType } from "@/generated/prisma/enums";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { AccountFilterChips, type ActiveFilterChip } from "./account-filter-chips";
import {
  ACCOUNT_PERIOD_MODE_OPTIONS,
  accountPeriodFullLabel,
  type AccountPeriodMode,
} from "./use-account-period-filter";

const ALL_CATEGORIES_VALUE = "__ALL__";

type TypeFilterValue = TransactionType | "ALL";

const TYPE_SEGMENTS: { value: TypeFilterValue; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: TransactionType.INCOME, label: "Receita" },
  { value: TransactionType.EXPENSE, label: "Despesa" },
];

/** Botão de um segmented control (período/tipo) — mesma pill em ambas as faixas (handoff "Conta (Detalhe)", `seg()`). */
function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-full rounded-[7px] px-3 text-[12.5px] font-bold transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

type AccountPeriodFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  mode: AccountPeriodMode;
  setMode: (mode: AccountPeriodMode) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  /** Categorias de despesa/receita agrupadas (`EntitySelect` group), mesma fonte de `transaction-filters-bar.tsx` (`useTransactionsReferenceData`). */
  categoryId: string | undefined;
  onCategoryIdChange: (value: string | undefined) => void;
  categoryOptions: EntitySelectOption[];
  categoryOptionsLoading?: boolean;
  /** Restrito a Receita/Despesa — `undefined` = "Todos". */
  type: TransactionType | undefined;
  onTypeChange: (value: TransactionType | undefined) => void;
};

/**
 * Filtros ricos do histórico de transações da conta (handoff "Conta
 * (Detalhe)", "FILTROS RICOS") — card com 3 faixas: busca + período
 * segmentado (faixa 1), tipo segmentado + categoria + De/Até quando
 * "Personalizado" (faixa 2), chips de filtro ativo (faixa 3). A busca vive
 * aqui visualmente (não mais na `DataTable`, ver `account-overview.tsx`) mas
 * o ESTADO é o mesmo repassado pro hook de listagem — só mudou onde o campo é
 * desenhado.
 */
export function AccountPeriodFilterBar({
  search,
  onSearchChange,
  mode,
  setMode,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  categoryId,
  onCategoryIdChange,
  categoryOptions,
  categoryOptionsLoading,
  type,
  onTypeChange,
}: AccountPeriodFilterBarProps) {
  const chips: ActiveFilterChip[] = [];
  if (type !== undefined) {
    chips.push({
      key: "type",
      label: `Tipo: ${type === TransactionType.INCOME ? "Receita" : "Despesa"}`,
      onRemove: () => onTypeChange(undefined),
    });
  }
  if (mode !== "all") {
    chips.push({ key: "period", label: accountPeriodFullLabel(mode), onRemove: () => setMode("all") });
  }
  if (search.trim()) {
    chips.push({ key: "search", label: `Busca: "${search.trim()}"`, onRemove: () => onSearchChange("") });
  }

  function clearAll() {
    onTypeChange(undefined);
    setMode("all");
    onSearchChange("");
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3.5 rounded-xl border border-border bg-card p-4",
        CARD_SHADOW_CLASS,
      )}
    >
      {/* faixa 1 — busca + período */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Buscar por descrição…"
            aria-label="Buscar por descrição"
            className="h-[38px] rounded-[10px] pl-9 text-[13.5px] font-semibold"
          />
        </div>

        <div className="flex h-[38px] items-center gap-1 rounded-[10px] border border-border bg-input p-1">
          {ACCOUNT_PERIOD_MODE_OPTIONS.map((option) => (
            <SegmentButton key={option.value} active={mode === option.value} onClick={() => setMode(option.value)}>
              {option.label}
            </SegmentButton>
          ))}
        </div>
      </div>

      {/* faixa 2 — tipo + categoria + (custom dates) */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-[38px] items-center gap-1 rounded-[9px] border border-border bg-input p-1">
          {TYPE_SEGMENTS.map((segment) => (
            <SegmentButton
              key={segment.value}
              active={segment.value === "ALL" ? type === undefined : type === segment.value}
              onClick={() => onTypeChange(segment.value === "ALL" ? undefined : segment.value)}
            >
              {segment.label}
            </SegmentButton>
          ))}
        </div>

        <EntitySelect
          aria-label="Filtrar por categoria"
          options={[{ value: ALL_CATEGORIES_VALUE, label: "Todas as categorias" }, ...categoryOptions]}
          value={categoryId ?? ALL_CATEGORIES_VALUE}
          onValueChange={(value) => onCategoryIdChange(value === ALL_CATEGORIES_VALUE ? undefined : value)}
          className="h-[38px] w-auto min-w-[170px]"
          disabled={categoryOptionsLoading}
        />

        {mode === "custom" && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="account-period-from" className="text-[12.5px] text-muted-foreground">
                De
              </Label>
              <DateField id="account-period-from" value={customFrom} onValueChange={setCustomFrom} className="w-[150px]" />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="account-period-to" className="text-[12.5px] text-muted-foreground">
                Até
              </Label>
              <DateField id="account-period-to" value={customTo} onValueChange={setCustomTo} className="w-[150px]" />
            </div>
          </div>
        )}
      </div>

      <AccountFilterChips chips={chips} onClearAll={clearAll} />
    </div>
  );
}
