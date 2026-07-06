"use client";

import { Wallet } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { formatBRL } from "@/lib/money/format";

export type AccountReportRow = {
  accountId: string;
  accountName: string;
  totalIn: number;
  totalOut: number;
  totalMovement: number;
};

const COLUMNS: DataTableColumn<AccountReportRow>[] = [
  { key: "accountName", header: "Conta", render: (row) => <span className="font-semibold">{row.accountName}</span> },
  {
    key: "totalIn",
    header: "Entradas",
    align: "right",
    render: (row) => <span className="font-mono text-success">{formatBRL(row.totalIn)}</span>,
  },
  {
    key: "totalOut",
    header: "Saídas",
    align: "right",
    render: (row) => <span className="font-mono text-destructive">{formatBRL(row.totalOut)}</span>,
  },
  {
    key: "totalMovement",
    header: "Movimentação",
    align: "right",
    render: (row) => <span className="font-mono text-muted-foreground">{formatBRL(row.totalMovement)}</span>,
  },
];

/**
 * "Por Conta" (docs/28-REPORTS.md, "Relatório por Conta") — inclui Transfer e
 * CARD_PAYMENT (regra oposta à de receita/despesa, já aplicada no backend por
 * `reportService.accountReport`). `DataTable` sem busca/sort/paginação —
 * listagem já vem pronta e pequena (poucas contas).
 */
export function AccountReportTable({ rows }: { rows: AccountReportRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={COLUMNS}
      getRowId={(row) => row.accountId}
      emptyState={{
        icon: Wallet,
        title: "Nenhuma movimentação por conta neste período.",
        description: "Ajuste os filtros ou registre transações no período selecionado.",
      }}
    />
  );
}
