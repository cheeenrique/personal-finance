"use client";

import type { ReactNode } from "react";

import { DateField } from "@/components/forms/date-field";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { CARD_PERIOD_MODE_OPTIONS, type CardPeriodMode } from "./use-card-period-filter";

/** Botão de um segmented control — mesma pill de `AccountPeriodFilterBar` (`/accounts/[id]`, `SegmentButton`), duplicada aqui em vez de importada (componente de outra feature, fora do escopo desta task). */
function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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

type CardPeriodFilterBarProps = {
  mode: CardPeriodMode;
  setMode: (mode: CardPeriodMode) => void;
  customFrom: string;
  setCustomFrom: (value: string) => void;
  customTo: string;
  setCustomTo: (value: string) => void;
  /** Prefixo de `id`/`htmlFor` dos campos De/Até — evita colisão quando mais de uma instância existir na mesma página. */
  idPrefix: string;
};

/**
 * Filtro de período segmentado (Mês atual/Mês passado/Personalizado) acima
 * da tabela de compras/movimentações do cartão (fonte visual: `Personal
 * Finance - Cartoes.dc.html`, faixa `ipThis`/`ipLast`/`ipCustom`) — mesmo
 * padrão visual da faixa 1 de `AccountPeriodFilterBar` (`/accounts/[id]`),
 * versão compacta sem busca/tipo/categoria (o filtro de categoria já vive
 * dentro da própria tabela, ver `invoice-items-table.tsx`).
 */
export function CardPeriodFilterBar({
  mode,
  setMode,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  idPrefix,
}: CardPeriodFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-[38px] items-center gap-1 rounded-[10px] border border-border bg-input p-1">
        {CARD_PERIOD_MODE_OPTIONS.map((option) => (
          <SegmentButton key={option.value} active={mode === option.value} onClick={() => setMode(option.value)}>
            {option.label}
          </SegmentButton>
        ))}
      </div>

      {mode === "custom" && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`${idPrefix}-from`} className="text-[12.5px] text-muted-foreground">
              De
            </Label>
            <DateField id={`${idPrefix}-from`} value={customFrom} onValueChange={setCustomFrom} className="w-[150px]" />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor={`${idPrefix}-to`} className="text-[12.5px] text-muted-foreground">
              Até
            </Label>
            <DateField id={`${idPrefix}-to`} value={customTo} onValueChange={setCustomTo} className="w-[150px]" />
          </div>
        </div>
      )}
    </div>
  );
}
