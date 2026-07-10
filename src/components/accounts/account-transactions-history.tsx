"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Receipt } from "lucide-react";

import { DataTable, type SortState } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { buildTransactionColumns } from "@/components/transactions/transaction-columns";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import type { TransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { isTransferLeg, useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import type { ClientTransaction, TransactionSort } from "@/modules/transactions/types";
import type { TransactionType } from "@/generated/prisma/enums";

import { ACCOUNT_PERIOD_SUMMARY_QUERY_KEY } from "./use-account-period-summary";
import { useAccountTransactionsList } from "./use-account-transactions-list";

const SORTABLE_KEYS: TransactionSort[] = ["date_desc", "date_asc", "amount_desc", "amount_asc"];

function sortStateToTransactionSort(sort: SortState): TransactionSort {
  if (!sort) return "date_desc";
  const key = `${sort.column}_${sort.direction}` as TransactionSort;
  return SORTABLE_KEYS.includes(key) ? key : "date_desc";
}

type AccountTransactionsHistoryProps = {
  accountId: string;
  search: string;
  categoryId: string | undefined;
  type: TransactionType | undefined;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  referenceData: TransactionsReferenceData;
};

/**
 * Histórico de transações da conta (docs/06-SCREENS.md, "Contas": "reaproveita
 * `DataTable` filtrada por `accountId`") — mesmas colunas/visual/ações de
 * linha da tela `/transactions` (`buildTransactionColumns`, `DataTable`,
 * `EditTransactionModal`, `useTransactionMutations`), incluindo a MESMA
 * paginação server-side (page/pageSize via `listTransactionsAction`,
 * `DataTablePagination`). Filtros (busca/período/tipo/categoria) e
 * `referenceData` são recebidos via props — vivem em `account-overview.tsx`
 * (irmão do card de filtros ricos e dos KPIs/resumo de fluxo, que também
 * precisam do período selecionado, ver handoff "Conta (Detalhe)"). Este
 * componente segue dono só da paginação/ordenação/seleção/modais da tabela
 * em si (SRP).
 */
export function AccountTransactionsHistory({
  accountId,
  search,
  categoryId,
  type,
  dateFrom,
  dateTo,
  referenceData,
}: AccountTransactionsHistoryProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [sort, setSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);

  // Qualquer mudança de filtro (busca/categoria/tipo/período/ordenação) invalida
  // a página atual — mesmo comportamento de `useTransactionFilters.replace`
  // (`/transactions`), só que em estado local em vez de query string. Ajuste
  // durante o render (padrão React "adjusting state when a prop changes"),
  // não em `useEffect` — evita o cascading render que a lint
  // `react-hooks/set-state-in-effect` acusa.
  const filtersKey = `${search}|${categoryId ?? ""}|${type ?? ""}|${dateFrom ?? ""}|${dateTo ?? ""}|${sort?.column ?? ""}|${sort?.direction ?? ""}`;
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setCurrentPage(1);
  }

  const { page, installmentTotals, loading, error, reload } = useAccountTransactionsList({
    accountId,
    search: search || undefined,
    categoryId,
    type,
    dateFrom,
    dateTo,
    sort: sortStateToTransactionSort(sort),
    page: currentPage,
  });

  /** Além de invalidar a listagem client-side (e o resumo do período, que soma os mesmos lançamentos), força o Server Component da página a refazer `accountService.listWithBalances` — o saldo (KPICard) é derivado das transactions, então editar/excluir aqui precisa refletir lá também. */
  function reloadAll() {
    reload();
    void queryClient.invalidateQueries({ queryKey: [ACCOUNT_PERIOD_SUMMARY_QUERY_KEY] });
    router.refresh();
  }

  const mutations = useTransactionMutations(reloadAll);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [viewing, setViewing] = useState<ClientTransaction | null>(null);
  const [deleting, setDeleting] = useState<ClientTransaction | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

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

  const selectedRows = page.items.filter((item) => selectedIds.includes(item.id));

  function handleSortChange(column: string) {
    setSort((current) =>
      current?.column === column && current.direction === "desc" ? { column, direction: "asc" } : { column, direction: "desc" },
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        data={page.items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyState={{
          icon: Receipt,
          title: "Nenhuma transação nesta conta",
          description: "Ajuste os filtros ou registre um novo lançamento em Transações.",
        }}
        sort={sort}
        onSortChange={handleSortChange}
        selection={{ selectedIds, onChange: setSelectedIds }}
        rowActions={(row) => (
          <TransactionRowActions
            row={row}
            onView={() => setViewing(row)}
            onMarkPaid={() => void mutations.markPaid(row)}
            onEdit={() => setEditing(row)}
            onDelete={() => setDeleting(row)}
          />
        )}
        bulkActions={() => (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void mutations.bulkMarkPaid(selectedRows).then(() => setSelectedIds([]))}
            >
              Marcar como pagas
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              Excluir selecionadas
            </Button>
          </>
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
        title={
          deleting && isTransferLeg(deleting)
            ? `Excluir a transferência "${deleting.description}"?`
            : `Excluir "${deleting?.description ?? ""}"?`
        }
        description={
          deleting && isTransferLeg(deleting)
            ? "As 2 pernas (saída e entrada) vão para a lixeira e o saldo das duas contas volta ao que era — o toast de confirmação traz um botão de desfazer."
            : "A transação vai para a lixeira — o toast de confirmação traz um botão de desfazer."
        }
        onConfirm={async () => {
          if (deleting) await mutations.deleteOne(deleting);
          setDeleting(null);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Excluir ${selectedRows.length} transação(ões) selecionada(s)?`}
        description="Essa ação em massa não tem desfazer — confirme com atenção."
        onConfirm={async () => {
          await mutations.bulkDelete(selectedRows);
          setSelectedIds([]);
        }}
      />
    </div>
  );
}
