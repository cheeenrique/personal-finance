"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { IS_PAID_OPTIONS } from "./transaction-filter-options";
import type { IsPaidFilter } from "./use-transaction-filters";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * Input de busca da Faixa 1 do card de filtros — mesmo debounce (300ms) +
 * resync de fonte externa que o `DataTable` usava antes de a busca vir pra cá
 * visualmente (ver JSDoc de `DataTable`, "Resync quando `search.value` muda
 * por uma fonte EXTERNA"), necessário pro "Limpar"/chip "Busca" zerarem o
 * campo sem deixar o termo digitado preso aqui.
 */
export function TransactionSearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [inputValue, setInputValue] = useState(value);
  const [lastSyncedValue, setLastSyncedValue] = useState(value);

  if (value !== lastSyncedValue) {
    setLastSyncedValue(value);
    setInputValue(value);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputValue !== value) onChange(inputValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  return (
    <div className="relative min-w-[220px] flex-1">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-[15px] -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={inputValue}
        onChange={(event) => setInputValue(event.target.value)}
        placeholder="Buscar por descrição…"
        className="h-[38px] rounded-[10px] pl-9"
      />
    </div>
  );
}

/** Segmentado Todos/Pago/Pendente da Faixa 1 — ativo em `bg-primary` (mesmo padrão de toggle usado no resto do app). */
export function TransactionIsPaidSegment({
  value,
  onChange,
}: {
  value: IsPaidFilter;
  onChange: (value: IsPaidFilter) => void;
}) {
  return (
    <div className="flex h-[38px] shrink-0 items-center gap-1 rounded-[10px] border border-border bg-input p-1">
      {IS_PAID_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "h-full rounded-[7px] px-2.5 text-[12.5px] font-bold transition-colors",
            value === option.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
