"use client";

import { CreditCard } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { formatBRL } from "@/lib/money/format";

export type CardReportRow = {
  cardId: string;
  cardName: string;
  /** MEAL não tem fatura/limite (docs/22-CREDIT_CARDS.md não cobre esse tipo) — troca o que as duas colunas de valor mostram, mesmo mapeamento do `card-tile.tsx`. */
  isMeal: boolean;
  currentInvoiceTotal: number;
  availableLimit: number;
  /** Só preenchido quando `isMeal` — ver `cardService.listWithSummary`. */
  mealSpent: number;
  mealRecharged: number;
  mealBalance: number;
};

const COLUMNS: DataTableColumn<CardReportRow>[] = [
  {
    key: "cardName",
    header: "Cartão",
    render: (row) => (
      <span className="inline-flex items-center gap-2">
        <span className="font-semibold">{row.cardName}</span>
        {row.isMeal && (
          <span className="shrink-0 rounded-full bg-success/16 px-2 py-0.5 text-[11px] font-bold text-on-success">
            Alimentação
          </span>
        )}
      </span>
    ),
  },
  {
    key: "currentInvoiceTotal",
    header: "Compras (fatura atual)",
    align: "right",
    render: (row) =>
      row.isMeal ? (
        <span className="font-mono text-foreground">
          {formatBRL(row.mealSpent)}{" "}
          <span className="text-xs font-medium text-muted-foreground">/ {formatBRL(row.mealRecharged)}</span>
        </span>
      ) : (
        <span className="font-mono text-destructive">{formatBRL(row.currentInvoiceTotal)}</span>
      ),
  },
  {
    key: "availableLimit",
    header: "Limite disponível",
    align: "right",
    render: (row) => (
      <span className={row.isMeal ? "font-mono text-success" : "font-mono text-muted-foreground"}>
        {formatBRL(row.isMeal ? row.mealBalance : row.availableLimit)}
      </span>
    ),
  },
];

/**
 * "Por Cartão" (docs/28-REPORTS.md, "Relatório por Cartão") — reusa
 * `cardService.listWithSummary` (módulo `cards`, já implementa exatamente
 * fatura atual + limite disponível, ver docs/22-CREDIT_CARDS.md). O período
 * dos filtros globais não se aplica aqui: fatura é sempre o ciclo ATUAL do
 * cartão (mesma semântica do Dashboard "Cartões e dívidas"). Cartão MEAL não
 * tem fatura/limite — as mesmas duas colunas mostram gasto/recarga e saldo
 * (`isMeal`, ver `page.tsx`), mesmo mapeamento de `card-tile.tsx`/`cards-summary.tsx`.
 */
export function CardReportTable({ rows }: { rows: CardReportRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={COLUMNS}
      getRowId={(row) => row.cardId}
      emptyState={{
        icon: CreditCard,
        title: "Nenhum cartão cadastrado.",
        description: "Cadastre um cartão para acompanhar fatura e limite aqui.",
      }}
    />
  );
}
