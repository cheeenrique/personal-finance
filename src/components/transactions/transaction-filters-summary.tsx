"use client";

import { X } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import type { TransactionListSummary } from "@/modules/transactions/types";

export type ActiveFilterChip = { key: string; label: string; onRemove: () => void };

type TransactionFiltersSummaryRowProps = {
  chips: ActiveFilterChip[];
  hasActiveFilters: boolean;
  onClear: () => void;
  summary: TransactionListSummary<string>;
  loading: boolean;
};

/**
 * Faixa 3 do card de filtros (`TransactionFiltersBar`) — chips removíveis por
 * filtro ativo à esquerda, resumo do resultado FILTRADO à direita (mesmo
 * agregado que alimenta `AccountFlowSummary`, ver `modules/transactions/
 * service.ts` `list`). Componente burro: quem monta os chips e busca o
 * agregado é o pai, aqui só renderiza.
 */
export function TransactionFiltersSummaryRow({
  chips,
  hasActiveFilters,
  onClear,
  summary,
  loading,
}: TransactionFiltersSummaryRowProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {hasActiveFilters ? (
          <>
            <span className="text-[11.5px] font-bold text-muted-foreground">Filtros:</span>
            {chips.map((chip) => (
              <span
                key={chip.key}
                className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-primary/16 py-0 pr-1.5 pl-2.5 text-[11.5px] font-bold text-on-primary"
              >
                {chip.label}
                <button
                  type="button"
                  onClick={chip.onRemove}
                  aria-label={`Remover filtro ${chip.label}`}
                  className="flex size-4 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
                >
                  <X className="size-2.5" aria-hidden="true" />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={onClear}
              className="h-[26px] rounded-full px-2.5 text-[11.5px] font-bold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Limpar
            </button>
          </>
        ) : (
          <span className="text-[11.5px] font-semibold text-muted-foreground">
            Nenhum filtro ativo · mostrando tudo do período
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <ResultSummary summary={summary} />
      )}
    </div>
  );
}

function ResultSummary({ summary }: { summary: TransactionListSummary<string> }) {
  const net = Number(summary.net);
  const netTone = net >= 0 ? "text-on-success" : "text-on-danger";

  return (
    <div className="flex flex-wrap items-center gap-4">
      <span className="text-xs font-bold text-muted-foreground">{summary.count} lançamento(s)</span>
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
        <span className="size-2 shrink-0 rounded-full bg-on-success" aria-hidden="true" />
        <span className="font-mono text-on-success">{formatBRL(summary.income)}</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold">
        <span className="size-2 shrink-0 rounded-full bg-on-danger" aria-hidden="true" />
        <span className="font-mono text-on-danger">{formatBRL(summary.expense)}</span>
      </span>
      <span className="inline-flex items-baseline gap-1.5 text-[12.5px] font-bold text-muted-foreground">
        Resultado
        <span className={cn("font-mono", netTone)}>
          {net >= 0 ? "+ " : "- "}
          {formatBRL(Math.abs(net))}
        </span>
      </span>
    </div>
  );
}
