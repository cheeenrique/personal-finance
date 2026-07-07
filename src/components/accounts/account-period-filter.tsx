"use client";

import { DateField } from "@/components/forms/date-field";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { Label } from "@/components/ui/label";
import { TransactionType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { ACCOUNT_PERIOD_MODE_OPTIONS, type AccountPeriodMode } from "./use-account-period-filter";

const ALL_CATEGORIES_VALUE = "__ALL__";
const ALL_TYPES_VALUE = "__ALL__";

/** Igual ao dropdown "Tipo" de `transaction-filters-bar.tsx`, sem as opções Transferência/Pagamento de fatura (fora do escopo desta tela). */
const TYPE_OPTIONS: EntitySelectOption[] = [
  { value: ALL_TYPES_VALUE, label: "Todos os tipos" },
  { value: TransactionType.INCOME, label: "Receita" },
  { value: TransactionType.EXPENSE, label: "Despesa" },
];

type AccountPeriodFilterBarProps = {
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
  /** Restrito a Receita/Despesa (ver `TYPE_OPTIONS`) — `undefined` = "Todos os tipos". */
  type: TransactionType | undefined;
  onTypeChange: (value: TransactionType | undefined) => void;
};

/**
 * Filtros do histórico de transações da conta — período (3 opções, toggle
 * segmentado no mesmo estilo do filtro "Pago/Pendente" de
 * `transaction-filters-bar.tsx`) + categoria + tipo (`EntitySelect`
 * reaproveitado de `/transactions`, tipo restrito a Receita/Despesa), na
 * MESMA barra. "Personalizado" revela 2 `DateField` (De/Até) inline, sem os
 * demais filtros de `/transactions` (escopo reduzido desta tela,
 * docs/21-ACCOUNTS.md "Filtros" traz o conjunto completo pra uma iteração
 * futura).
 */
export function AccountPeriodFilterBar({
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
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-border bg-secondary/30 p-2">
      <div className="flex h-[38px] items-center gap-1 rounded-[10px] border border-border bg-input p-1">
        {ACCOUNT_PERIOD_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            className={cn(
              "h-full rounded-[7px] px-2.5 text-[12.5px] font-bold transition-colors",
              mode === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <EntitySelect
        aria-label="Filtrar por tipo"
        options={TYPE_OPTIONS}
        value={type ?? ALL_TYPES_VALUE}
        onValueChange={(value) => onTypeChange(value === ALL_TYPES_VALUE ? undefined : (value as TransactionType))}
        className="h-[38px] w-auto min-w-[150px]"
      />

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
  );
}
