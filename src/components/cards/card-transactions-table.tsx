"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";

import { DataTable } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { buildTransactionColumns } from "@/components/transactions/transaction-columns";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";
import { useCardTransactionsList } from "./use-card-transactions-list";

type CardTransactionsTableProps = {
  cardId: string;
  /** Range do segmented control acima (`use-card-period-filter.ts`, ver `card-detail-view-meal.tsx`) — `YYYY-MM-DD`, `undefined` num dos lados = sem limite. */
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Recargas (INCOME) + gastos (EXPENSE) de um cartão MEAL dentro do período
 * selecionado — MESMA `DataTable` + colunas (`buildTransactionColumns`) +
 * paginação server-side + editar/excluir de `InvoiceItemsTable` (fatura
 * CREDIT), sem o filtro de categoria (aqui o filtro é `cardId` + período,
 * ver `use-card-transactions-list.ts`), sem noção de fatura/ciclo (MEAL não
 * tem, ver `modules/cards/service.ts` `assertCreditCard`).
 */
export function CardTransactionsTable({ cardId, dateFrom, dateTo }: CardTransactionsTableProps) {
  const router = useRouter();
  const referenceData = useTransactionsReferenceData();
  const [currentPage, setCurrentPage] = useState(1);

  // Trocar de período invalida a página atual — mesmo ajuste durante o
  // render (não `useEffect`) de `InvoiceItemsTable`/`AccountTransactionsHistory`.
  const [prevRange, setPrevRange] = useState({ dateFrom, dateTo });
  if (dateFrom !== prevRange.dateFrom || dateTo !== prevRange.dateTo) {
    setPrevRange({ dateFrom, dateTo });
    setCurrentPage(1);
  }

  const { page, installmentTotals, loading, error, reload } = useCardTransactionsList({
    cardId,
    dateFrom,
    dateTo,
    page: currentPage,
  });

  /** Além da listagem client-side, refaz o Server Component da página — o saldo (KPICard) é derivado das transactions (ver `card-detail-view-meal.tsx`). */
  function reloadAll() {
    reload();
    router.refresh();
  }

  const mutations = useTransactionMutations(reloadAll);

  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [viewing, setViewing] = useState<ClientTransaction | null>(null);
  const [deleting, setDeleting] = useState<ClientTransaction | null>(null);

  const columns = useMemo(
    () =>
      buildTransactionColumns({
        categoryById: referenceData.categoryById,
        accountNameById: referenceData.accountNameById,
        cardNameById: referenceData.cardNameById,
        installmentTotals,
      }),
    [referenceData.categoryById, referenceData.accountNameById, referenceData.cardNameById, installmentTotals],
  );

  return (
    <>
      <DataTable
        data={page.items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyState={{
          icon: Receipt,
          title: "Nenhuma movimentação no período",
          description: "Recargas e gastos lançados neste cartão dentro do período selecionado aparecem aqui.",
        }}
        rowActions={(row) => (
          <TransactionRowActions
            row={row}
            onView={() => setViewing(row)}
            onMarkPaid={() => void mutations.markPaid(row)}
            onEdit={() => setEditing(row)}
            onDelete={() => setDeleting(row)}
          />
        )}
        pagination={{ page: page.page, pageSize: page.pageSize, total: page.total, onPageChange: setCurrentPage }}
      />

      <EditTransactionModal
        transaction={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        referenceData={referenceData}
        onSaved={() => {
          setEditing(null);
          reloadAll();
        }}
      />

      <TransactionDetailModal
        transaction={viewing}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
        referenceData={referenceData}
        installmentTotals={installmentTotals}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Excluir "${deleting?.description ?? ""}"?`}
        description="A transação vai para a lixeira — o toast de confirmação traz um botão de desfazer."
        onConfirm={async () => {
          if (deleting) await mutations.deleteOne(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}
