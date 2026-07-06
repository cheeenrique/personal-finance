"use client";

import { CreditCard } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { formatBRL } from "@/lib/money/format";

export type CardReportRow = {
  cardId: string;
  cardName: string;
  currentInvoiceTotal: number;
  availableLimit: number;
};

const COLUMNS: DataTableColumn<CardReportRow>[] = [
  { key: "cardName", header: "Cartão", render: (row) => <span className="font-semibold">{row.cardName}</span> },
  {
    key: "currentInvoiceTotal",
    header: "Compras (fatura atual)",
    align: "right",
    render: (row) => <span className="font-mono text-destructive">{formatBRL(row.currentInvoiceTotal)}</span>,
  },
  {
    key: "availableLimit",
    header: "Limite disponível",
    align: "right",
    render: (row) => <span className="font-mono text-muted-foreground">{formatBRL(row.availableLimit)}</span>,
  },
];

/**
 * "Por Cartão" (docs/28-REPORTS.md, "Relatório por Cartão") — reusa
 * `cardService.listWithSummary` (módulo `cards`, já implementa exatamente
 * fatura atual + limite disponível, ver docs/22-CREDIT_CARDS.md). O período
 * dos filtros globais não se aplica aqui: fatura é sempre o ciclo ATUAL do
 * cartão (mesma semântica do Dashboard "Cartões e dívidas").
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
