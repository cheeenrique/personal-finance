"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Layers3, Receipt } from "lucide-react";

import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useShell } from "@/components/providers/shell-provider";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

import { TransactionFiltersBar } from "./transaction-filters-bar";
import { buildTransactionColumns } from "./transaction-columns";
import { EditTransactionModal } from "./edit-transaction-modal";
import { TransactionDetailModal } from "./transaction-detail-modal";
import { TransactionRowActions } from "./transaction-row-actions";
import { TransferFormModal } from "./transfer-form-modal";
import { NewInstallmentModal } from "./new-installment-modal";
import { useTransactionFilters } from "./use-transaction-filters";
import { useTransactionsReferenceData } from "./use-transactions-reference-data";
import { useTransactionsList } from "./use-transactions-list";
import { buildTransactionDraft, isTransferLeg, useTransactionMutations } from "./use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";

/**
 * Orquestrador da tela `/transactions` (docs/06-SCREENS.md, "Transações").
 * 100% client-side: filtros na URL, dados via Server Actions chamadas
 * diretamente (mesmo padrão do `NewTransactionForm`), sem depender de
 * `revalidatePath` pra refletir mutations — cada mutation chama `reload()`.
 */
export function TransactionsView() {
  const router = useRouter();
  const { openTransactionModal, duplicateTransaction } = useShell();
  const filters = useTransactionFilters();
  const referenceData = useTransactionsReferenceData();
  const { page, installmentTotals, loading, error, reload } = useTransactionsList(filters.state);
  const mutations = useTransactionMutations(reload);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [viewing, setViewing] = useState<ClientTransaction | null>(null);
  const [deleting, setDeleting] = useState<ClientTransaction | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [installmentOpen, setInstallmentOpen] = useState(false);

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

  // Base zerada (docs/50-AUDITORIA-BACKLOG.md F7): sem conta NEM cartão
  // cadastrado, o modal de Nova Transação abre com os 2 selects "Nada
  // encontrado" e nenhum caminho pra sair de lá — troca o CTA da tabela vazia
  // pra apontar pro cadastro em vez de abrir um modal sem como salvar.
  const hasNoOrigins = !referenceData.loading && referenceData.originOptions.length === 0;

  function handleSortChange(column: string) {
    const current = filters.state.sort;
    const direction = current?.column === column && current.direction === "desc" ? "asc" : "desc";
    filters.setSort({ column, direction });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setInstallmentOpen(true)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-transparent px-3.5 text-[13px] font-bold text-muted-foreground transition-colors duration-100 ease-pf-out hover:border-muted-foreground",
            FOCUS_RING_CLASS,
          )}
        >
          <Layers3 className="size-[15px]" aria-hidden="true" />
          Nova compra parcelada
        </button>
        <button
          type="button"
          onClick={() => setTransferOpen(true)}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-[10px] border border-border bg-transparent px-3.5 text-[13px] font-bold text-muted-foreground transition-colors duration-100 ease-pf-out hover:border-muted-foreground",
            FOCUS_RING_CLASS,
          )}
        >
          <ArrowLeftRight className="size-[15px]" aria-hidden="true" />
          Nova transferência
        </button>
      </div>

      <DataTable
        data={page.items}
        columns={columns}
        getRowId={(row) => row.id}
        loading={loading}
        error={error}
        onRetry={reload}
        fillHeight
        emptyState={{
          icon: Receipt,
          title: "Nenhuma transação encontrada.",
          description: hasNoOrigins
            ? "Cadastre uma conta ou cartão antes de lançar sua primeira transação."
            : filters.hasActiveFilters
              ? "Ajuste os filtros ou crie uma nova transação."
              : "Comece registrando sua primeira transação.",
          actionLabel: hasNoOrigins ? "Criar primeira conta" : "Criar transação",
          onAction: () => (hasNoOrigins ? router.push("/accounts") : openTransactionModal()),
        }}
        search={{ value: filters.state.q, onChange: filters.setQuery, placeholder: "Buscar por descrição…" }}
        filters={
          <TransactionFiltersBar
            type={filters.state.type}
            onTypeChange={filters.setType}
            categoryId={filters.state.categoryId}
            onCategoryIdChange={filters.setCategoryId}
            origin={filters.state.origin}
            onOriginChange={filters.setOrigin}
            period={filters.state.period}
            onPeriodChange={filters.setPeriod}
            customFrom={filters.state.customFrom}
            onCustomFromChange={filters.setCustomFrom}
            customTo={filters.state.customTo}
            onCustomToChange={filters.setCustomTo}
            tagId={filters.state.tagId}
            onTagIdChange={filters.setTagId}
            isPaid={filters.state.isPaid}
            onIsPaidChange={filters.setIsPaid}
            referenceData={referenceData}
            hasActiveFilters={filters.hasActiveFilters}
            onClear={filters.clearAll}
          />
        }
        sort={filters.state.sort}
        onSortChange={handleSortChange}
        selection={{ selectedIds, onChange: setSelectedIds }}
        rowActions={(row) => (
          <TransactionRowActions
            row={row}
            onView={() => setViewing(row)}
            onMarkPaid={() => void mutations.markPaid(row)}
            onEdit={() => setEditing(row)}
            onDuplicate={() => duplicateTransaction(buildTransactionDraft(row))}
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
        pagination={{ page: page.page, pageSize: page.pageSize, total: page.total, onPageChange: filters.setPage }}
      />

      <EditTransactionModal
        transaction={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        referenceData={referenceData}
        onSaved={() => {
          setEditing(null);
          reload();
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

      <TransferFormModal open={transferOpen} onOpenChange={setTransferOpen} referenceData={referenceData} onSaved={reload} />
      <NewInstallmentModal
        open={installmentOpen}
        onOpenChange={setInstallmentOpen}
        referenceData={referenceData}
        onSaved={reload}
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
