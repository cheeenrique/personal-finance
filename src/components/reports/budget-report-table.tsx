"use client";

import { PiggyBank } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { Badge } from "@/components/ui/badge";
import type { BudgetStatus } from "@/modules/budgets/types";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";

export type BudgetReportRow = {
  id: string;
  categoryName: string;
  plannedAmount: number;
  spentAmount: number;
  progress: number;
  status: BudgetStatus;
};

/** Faixas do card de budget (docs/26-BUDGETS.md, "Estados Visuais"): Normal até 80%, Atenção 80-100%, Estourado >100%. */
const STATUS_LABEL: Record<BudgetStatus, string> = {
  NORMAL: "Normal",
  ATTENTION: "Atenção",
  OVER: "Estourado",
};

const STATUS_CLASS: Record<BudgetStatus, string> = {
  NORMAL: "bg-success/15 text-success",
  ATTENTION: "bg-warning/15 text-warning",
  OVER: "bg-destructive/15 text-destructive",
};

function StatusBadge({ status }: { status: BudgetStatus }) {
  return <Badge className={cn("border-transparent font-bold", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</Badge>;
}

const COLUMNS: DataTableColumn<BudgetReportRow>[] = [
  {
    key: "categoryName",
    header: "Categoria",
    render: (row) => <span className="font-semibold">{row.categoryName}</span>,
  },
  {
    key: "plannedAmount",
    header: "Planejado",
    align: "right",
    render: (row) => <span className="font-mono text-muted-foreground">{formatBRL(row.plannedAmount)}</span>,
  },
  {
    key: "spentAmount",
    header: "Realizado",
    align: "right",
    render: (row) => <span className="font-mono">{formatBRL(row.spentAmount)}</span>,
  },
  {
    key: "progress",
    header: "%",
    align: "right",
    render: (row) => <span className="font-mono">{row.progress.toFixed(0)}%</span>,
  },
  {
    key: "status",
    header: "Status",
    align: "right",
    render: (row) => <StatusBadge status={row.status} />,
  },
];

/**
 * "Orçamento vs Realizado" (docs/28-REPORTS.md, "Relatório de Orçamento") —
 * reusa `budgetService.listWithProgress` (módulo `budgets`, já calcula
 * `spentAmount`/progresso/status). `year`/`month` vêm do fim do período
 * selecionado nos filtros globais (mesma referência do relatório de
 * categorias, ver `page.tsx` `deriveYearMonth`).
 */
export function BudgetReportTable({ rows }: { rows: BudgetReportRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={COLUMNS}
      getRowId={(row) => row.id}
      emptyState={{
        icon: PiggyBank,
        title: "Nenhum orçamento definido para este período.",
        description: "Crie um orçamento por categoria em Orçamentos para acompanhar aqui.",
      }}
    />
  );
}
