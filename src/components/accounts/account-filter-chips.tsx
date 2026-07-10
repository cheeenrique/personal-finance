"use client";

import { X } from "lucide-react";

import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

export type ActiveFilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type AccountFilterChipsProps = {
  chips: ActiveFilterChip[];
  onClearAll: () => void;
};

/**
 * Faixa 3 dos filtros ricos (handoff "Conta (Detalhe)", "active filter
 * chips") — só aparece quando há pelo menos 1 filtro fora do default (tipo/
 * período/busca, mesmo conjunto do handoff; categoria fica fora, igual ao
 * protótipo: o próprio `EntitySelect` já mostra o nome selecionado no
 * trigger). Cada pill remove só o SEU filtro; "Limpar tudo" reseta os 3.
 */
export function AccountFilterChips({ chips, onClearAll }: AccountFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <span className="text-[11.5px] font-bold text-muted-foreground">Filtros ativos:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-primary/16 py-0 pr-1.5 pl-2.5 text-[11.5px] font-bold text-on-primary"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remover filtro: ${chip.label}`}
            className={cn(
              "flex size-4 items-center justify-center rounded-full bg-white/12 text-inherit",
              FOCUS_RING_CLASS,
            )}
          >
            <X className="size-2.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className={cn(
          "h-[26px] rounded-full px-2.5 text-[11.5px] font-bold text-muted-foreground underline-offset-2 hover:underline",
          FOCUS_RING_CLASS,
        )}
      >
        Limpar tudo
      </button>
    </div>
  );
}
