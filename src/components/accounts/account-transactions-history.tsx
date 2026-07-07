"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";

import { DataTable, type SortState } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { buildTransactionColumns } from "@/components/transactions/transaction-columns";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import type { ClientTransaction, TransactionSort } from "@/modules/transactions/types";

import { AccountPeriodFilterBar } from "./account-period-filter";
import { useAccountPeriodFilter } from "./use-account-period-filter";
import { useAccountTransactionsList } from "./use-account-transactions-list";

const SORTABLE_KEYS: TransactionSort[] = ["date_desc", "date_asc", "amount_desc", "amount_asc"];

function sortStateToTransactionSort(sort: SortState): TransactionSort {
  if (!sort) return "date_desc";
  const key = `${sort.column}_${sort.direction}` as TransactionSort;
  return SORTABLE_KEYS.includes(key) ? key : "date_desc";
}

type AccountTransactionsHistoryProps = { accountId: string };

/**
 * Histórico de transações da conta (docs/06-SCREENS.md, "Contas": "reaproveita
 * `DataTable` filtrada por `accountId`") — mesmas colunas/visual/ações de
 * linha da tela `/transactions` (`buildTransactionColumns`, `DataTable`,
 * `EditTransactionModal`, `useTransactionMutations`), incluindo a MESMA
 * paginação server-side (page/pageSize via `listTransactionsAction`,
 * `DataTablePagination`) — com filtro próprio restrito a período (Mês atual/
 * Mês passado/Personalizado) + categoria em vez do filtro bar completo. Os
 * demais filtros de `docs/21-ACCOUNTS.md` ("tipo/tag/valor") e o gráfico de
 * entradas/saídas ficam para uma iteração futura (ver "Improvement
 * Suggestions" no resumo).
 */
export function AccountTransactionsHistory({ accountId }: AccountTransactionsHistoryProps) {
  const router = useRouter();
  const periodFilter = useAccountPeriodFilter();
  const referenceData = useTransactionsReferenceData();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<SortState>({ column: "date", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);

  // Qualquer mudança de filtro (busca/categoria/período/ordenação) invalida a
  // página atual — mesmo comportamento de `useTransactionFilters.replace`
  // (`/transactions`), só que em estado local em vez de query string. Ajuste
  // durante o render (padrão React "adjusting state when a prop changes"),
  // não em `useEffect` — evita o cascading render que a lint
  // `react-hooks/set-state-in-effect` acusa.
  const filtersKey = `${search}|${categoryId ?? ""}|${periodFilter.range.dateFrom ?? ""}|${periodFilter.range.dateTo ?? ""}|${sort?.column ?? ""}|${sort?.direction ?? ""}`;
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  if (filtersKey !== prevFiltersKey) {
    setPrevFiltersKey(filtersKey);
    setCurrentPage(1);
  }

  const { page, installmentTotals, loading, error, reload } = useAccountTransactionsList({
    accountId,
    search: search || undefined,
    categoryId,
    dateFrom: periodFilter.range.dateFrom,
    dateTo: periodFilter.range.dateTo,
    sort: sortStateToTransactionSort(sort),
    page: currentPage,
  });

  /** Além de invalidar a listagem client-side, força o Server Component da página a refazer `accountService.listWithBalances` — o saldo (KPICard) é derivado das transactions, então editar/excluir aqui precisa refletir lá também. */
  function reloadAll() {
    reload();
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
          description: "Ajuste o período ou registre um novo lançamento em Transações.",
        }}
        search={{ value: search, onChange: setSearch, placeholder: "Buscar por descrição…" }}
        filters={
          <AccountPeriodFilterBar
            {...periodFilter}
            categoryId={categoryId}
            onCategoryIdChange={setCategoryId}
            categoryOptions={referenceData.categoryOptions}
            categoryOptionsLoading={referenceData.loading}
          />
        }
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
        title={`Excluir "${deleting?.description ?? ""}"?`}
        description="A transação vai para a lixeira — o toast de confirmação traz um botão de desfazer."
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
