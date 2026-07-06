import { TransactionType } from "@/generated/prisma/enums";
import type { ClientTransaction } from "@/modules/transactions/types";
import type { DataTableColumn } from "@/components/tables/data-table";
import {
  TransactionTypeBadge,
  InstallmentBadge,
} from "@/components/shared/badges/transaction-type-badge";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

type ColumnDeps = {
  categoryNameById: Map<string, string>;
  accountNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  installmentTotals: Map<string, number>;
};

/** Cor + sinal do valor: transferência usa o tom próprio (`on-transfer`), nunca a cor de receita/despesa crua. */
function amountAppearance(row: ClientTransaction): { className: string; sign: string } {
  if (row.transferId) {
    return { className: "text-on-transfer", sign: row.type === TransactionType.INCOME ? "+" : "-" };
  }
  if (row.type === TransactionType.INCOME) return { className: "text-success", sign: "+" };
  if (row.type === TransactionType.EXPENSE) return { className: "text-destructive", sign: "-" };
  return { className: "text-muted-foreground", sign: "-" };
}

/**
 * Definição das colunas da `DataTable` de Transações (docs/06-SCREENS.md,
 * "Transações"). A listagem (`listTransactionsAction`) só traz IDs — nomes de
 * categoria/conta/cartão são resolvidos aqui via os mapas carregados por
 * `useTransactionsReferenceData`.
 */
export function buildTransactionColumns({
  categoryNameById,
  accountNameById,
  cardNameById,
  installmentTotals,
}: ColumnDeps): DataTableColumn<ClientTransaction>[] {
  return [
    {
      key: "date",
      header: "Data",
      sortable: true,
      render: (row) => <span className="font-mono whitespace-nowrap">{formatDateSaoPaulo(row.date)}</span>,
    },
    {
      key: "description",
      header: "Descrição",
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate">{row.description}</span>
          {row.installmentPurchaseId && row.installmentNumber && (
            <InstallmentBadge
              current={row.installmentNumber}
              total={installmentTotals.get(row.installmentPurchaseId) ?? row.installmentNumber}
            />
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      render: (row) => (
        <span className="text-muted-foreground">
          {row.categoryId ? (categoryNameById.get(row.categoryId) ?? "—") : "—"}
        </span>
      ),
    },
    {
      key: "origin",
      header: "Conta / Cartão",
      render: (row) => (
        <span className="text-muted-foreground">
          {(row.accountId && accountNameById.get(row.accountId)) ||
            (row.cardId && cardNameById.get(row.cardId)) ||
            "—"}
        </span>
      ),
    },
    {
      key: "type",
      header: "Tipo",
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <TransactionTypeBadge type={row.type} />
          {!row.isPaid && <span className="text-[10.5px] font-bold text-warning">Pendente</span>}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      sortable: true,
      render: (row) => {
        const { className, sign } = amountAppearance(row);
        return (
          <span className={cn("font-mono font-bold whitespace-nowrap", className)}>
            {sign}
            {formatBRL(row.amount)}
          </span>
        );
      },
    },
  ];
}
