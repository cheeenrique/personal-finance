"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import type { RecentTransactionRow } from "@/modules/transactions/types";
import { TransactionType } from "@/generated/prisma/enums";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { TransactionTypeBadge, InstallmentBadge } from "@/components/shared/badges/transaction-type-badge";
import { useShell } from "@/components/providers/shell-provider";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

/** Tipo de exibição — perna de transferência mostra badge "Transferência" mesmo persistida como EXPENSE/INCOME (docs/06-SCREENS.md, "Linha de TRANSFER"). */
function displayType(row: RecentTransactionRow): TransactionType {
  return row.transferId ? TransactionType.TRANSFER : row.type;
}

function AmountCell({ row }: { row: RecentTransactionRow }) {
  const type = displayType(row);
  const isNegative = type === TransactionType.EXPENSE || type === TransactionType.CARD_PAYMENT;
  const value = row.amount.toNumber();

  return (
    <span
      className={cn(
        "font-mono text-[13.5px] font-semibold",
        type === TransactionType.INCOME && "text-success",
        isNegative && "text-destructive",
        type === TransactionType.TRANSFER && "text-on-transfer",
      )}
    >
      {isNegative ? "− " : type === TransactionType.INCOME ? "+ " : ""}
      {formatBRL(value)}
    </span>
  );
}

const COLUMNS: DataTableColumn<RecentTransactionRow>[] = [
  {
    key: "description",
    header: "Descrição",
    render: (row) => (
      <div className="flex items-center gap-2">
        <TransactionTypeBadge type={displayType(row)} />
        <span className="truncate font-semibold text-foreground">{row.description}</span>
        {row.installmentNumber && row.installmentsCount && (
          <InstallmentBadge current={row.installmentNumber} total={row.installmentsCount} />
        )}
      </div>
    ),
  },
  {
    key: "category",
    header: "Categoria",
    render: (row) => <span className="text-muted-foreground">{row.categoryName ?? "—"}</span>,
  },
  {
    key: "source",
    header: "Conta / Cartão",
    render: (row) => <span className="text-muted-foreground">{row.accountName ?? row.cardName ?? "—"}</span>,
  },
  {
    key: "date",
    header: "Data",
    render: (row) => <span className="font-mono text-muted-foreground">{formatDateSaoPaulo(row.date)}</span>,
  },
  {
    key: "amount",
    header: "Valor",
    align: "right",
    render: (row) => <AmountCell row={row} />,
  },
];

type RecentTransactionsTableProps = {
  transactions: RecentTransactionRow[];
};

/**
 * Preview "Últimas Transações" do Dashboard (docs/11-DASHBOARD.md, "6.
 * Últimas Transações") — sem paginação, sem busca/filtro (isso vive em
 * `/transactions`). Link "Ver todas" leva pra lá.
 */
export function RecentTransactionsTable({ transactions }: RecentTransactionsTableProps) {
  const { openTransactionModal } = useShell();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-foreground">Últimas transações</h3>
        <Link href="/transactions" className="text-[12.5px] font-bold text-primary hover:underline">
          Ver todas
        </Link>
      </div>

      <DataTable
        data={transactions}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        emptyState={{
          icon: Receipt,
          title: "Nenhuma movimentação ainda",
          description: "Registre sua primeira receita ou despesa para começar.",
          actionLabel: "Criar primeira transação",
          onAction: () => openTransactionModal(),
        }}
      />
    </div>
  );
}
