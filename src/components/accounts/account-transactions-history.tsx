"use client";

import { Receipt } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { TransactionTypeBadge } from "@/components/shared/badges/transaction-type-badge";
import { TransactionType } from "@/generated/prisma/enums";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";
import type { AccountTransactionRow } from "./types";

/**
 * Histórico de transações da conta (docs/21-ACCOUNTS.md, "Detalhe da Conta").
 * Recebe os dados já buscados pelo Server Component (`page.tsx`) — evita
 * refazer a query no client e evita passar `Prisma.Decimal` cru por uma
 * Server Action (RSC não serializa a instância; a conversão pra string já
 * acontece na borda antes de chegar aqui). Somente leitura: editar/excluir
 * uma transação continua em `/transactions` (ver "Improvement Suggestions").
 */
export function AccountTransactionsHistory({ transactions }: { transactions: AccountTransactionRow[] }) {
  const columns: DataTableColumn<AccountTransactionRow>[] = [
    {
      key: "date",
      header: "Data",
      render: (row) => <span className="font-mono">{formatDateSaoPaulo(row.date)}</span>,
    },
    {
      key: "description",
      header: "Descrição",
      render: (row) => row.description,
    },
    {
      key: "type",
      header: "Tipo",
      render: (row) => <TransactionTypeBadge type={row.type} />,
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      render: (row) => (
        <span
          className={cn(
            "font-mono font-semibold",
            row.type === TransactionType.INCOME ? "text-success" : "text-destructive",
          )}
        >
          {row.type === TransactionType.INCOME ? "+" : "-"}
          {formatBRL(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      data={transactions}
      columns={columns}
      getRowId={(row) => row.id}
      emptyState={{
        icon: Receipt,
        title: "Nenhuma transação nesta conta",
        description: "Transações lançadas nesta conta aparecem aqui.",
      }}
    />
  );
}
