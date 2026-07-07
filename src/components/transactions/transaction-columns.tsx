import { CategoryType, TransactionType } from "@/generated/prisma/enums";
import type { ClientTransaction } from "@/modules/transactions/types";
import type { DataTableColumn } from "@/components/tables/data-table";
import { TruncatedText } from "@/components/tables/truncated-text";
import { TransactionInlineBadges } from "@/components/shared/badges/transaction-type-badge";
import { resolveCategoryDotColor } from "@/components/categories/category-config";
import type { CategoryRef } from "./use-transactions-reference-data";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

type ColumnDeps = {
  categoryById: Map<string, CategoryRef>;
  accountNameById: Map<string, string>;
  cardNameById: Map<string, string>;
  installmentTotals: Map<string, number>;
};

/**
 * Cor + sinal do valor: transferência usa o tom próprio (`on-transfer`), nunca
 * a cor de receita/despesa crua. Exportado — reaproveitado por
 * `TransactionDetailModal` (mesmo cálculo do valor grande no topo do modal).
 */
export function amountAppearance(row: ClientTransaction): { className: string; sign: string } {
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
  categoryById,
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
      // Sem coluna "Tipo" própria (design/Personal Finance App.dc.html,
      // "Transações"): parcela/transferência/fatura/pendência viram pills
      // inline aqui, junto da descrição.
      render: (row) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <TruncatedText
            text={row.description}
            className="max-w-[220px] flex-1 font-semibold text-foreground sm:max-w-[320px] md:max-w-[420px]"
          />
          <TransactionInlineBadges
            row={{
              type: row.type,
              transferId: row.transferId,
              isPaid: row.isPaid,
              installmentNumber: row.installmentPurchaseId ? row.installmentNumber : null,
              installmentsCount: row.installmentPurchaseId
                ? (installmentTotals.get(row.installmentPurchaseId) ?? row.installmentNumber)
                : null,
              loanId: row.loanId,
            }}
          />
        </div>
      ),
    },
    {
      key: "category",
      header: "Categoria",
      render: (row) => {
        const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
        if (!category) return <span className="text-muted-foreground">—</span>;

        return (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: resolveCategoryDotColor(category.color, row.type as unknown as CategoryType),
              }}
              aria-hidden="true"
            />
            {category.name}
          </span>
        );
      },
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
