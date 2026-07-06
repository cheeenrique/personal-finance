"use client";

import Link from "next/link";
import { Receipt } from "lucide-react";

import type { RecentTransactionRowClient } from "@/modules/transactions/types";
import { CategoryType, TransactionType } from "@/generated/prisma/enums";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { TransactionInlineBadges } from "@/components/shared/badges/transaction-type-badge";
import { useShell } from "@/components/providers/shell-provider";
import { resolveCategoryDotColor } from "@/components/categories/category-config";
import { formatBRL } from "@/lib/money/format";
import { formatDateShortSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

/** Tipo de exibição — perna de transferência mostra badge "Transfer" mesmo persistida como EXPENSE/INCOME (docs/06-SCREENS.md, "Linha de TRANSFER"). */
function displayType(row: RecentTransactionRowClient): TransactionType {
  return row.transferId ? TransactionType.TRANSFER : row.type;
}

/**
 * Descrição + badges inline (parcela/transferência/pendência) + data curta
 * abaixo — layout do preview do Dashboard (design/Personal Finance
 * App.dc.html, "últimas transações"), diferente da tabela completa de
 * `/transactions` (que tem coluna de Data e Ações próprias).
 */
function DescriptionCell({ row }: { row: RecentTransactionRowClient }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[13.5px] font-extrabold text-foreground">{row.description}</span>
        <TransactionInlineBadges row={row} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{formatDateShortSaoPaulo(row.date)}</span>
    </div>
  );
}

/**
 * Categoria só existe em transação INCOME/EXPENSE (transferência e pagamento
 * de fatura não têm — mostram "—"), então `row.type` aqui equivale a
 * `CategoryType` pra efeito do fallback de cor (mesma regra de
 * `category-row.tsx` quando a categoria não tem `color` próprio).
 */
function CategoryCell({ row }: { row: RecentTransactionRowClient }) {
  if (!row.categoryName) return <span className="text-[12.5px] font-semibold text-muted-foreground">—</span>;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: resolveCategoryDotColor(row.categoryColor, row.type as unknown as CategoryType) }}
        aria-hidden="true"
      />
      {row.categoryName}
    </span>
  );
}

function AmountCell({ row }: { row: RecentTransactionRowClient }) {
  const type = displayType(row);
  const isNegative = type === TransactionType.EXPENSE || type === TransactionType.CARD_PAYMENT;
  const value = row.amount;

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

const COLUMNS: DataTableColumn<RecentTransactionRowClient>[] = [
  {
    key: "description",
    header: "Descrição",
    render: (row) => <DescriptionCell row={row} />,
  },
  {
    key: "category",
    header: "Categoria",
    render: (row) => <CategoryCell row={row} />,
  },
  {
    key: "source",
    header: "Conta / Cartão",
    render: (row) => (
      <span className="text-[12.5px] font-semibold text-muted-foreground">
        {row.accountName ?? row.cardName ?? "—"}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Valor",
    align: "right",
    render: (row) => <AmountCell row={row} />,
  },
];

type RecentTransactionsTableProps = {
  transactions: RecentTransactionRowClient[];
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
