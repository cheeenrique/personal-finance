"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Layers3, Pencil, Receipt, Trash2 } from "lucide-react";

import { DataTable } from "@/components/tables/data-table";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShell } from "@/components/providers/shell-provider";

import { TransactionFiltersBar } from "./transaction-filters-bar";
import { buildTransactionColumns } from "./transaction-columns";
import { EditTransactionModal } from "./edit-transaction-modal";
import { TransferFormModal } from "./transfer-form-modal";
import { NewInstallmentModal } from "./new-installment-modal";
import { useTransactionFilters } from "./use-transaction-filters";
import { useTransactionsReferenceData } from "./use-transactions-reference-data";
import { useTransactionsList } from "./use-transactions-list";
import { isTransferLeg, useTransactionMutations } from "./use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";

/**
 * Orquestrador da tela `/transactions` (docs/06-SCREENS.md, "Transações").
 * 100% client-side: filtros na URL, dados via Server Actions chamadas
 * diretamente (mesmo padrão do `NewTransactionForm`), sem depender de
 * `revalidatePath` pra refletir mutations — cada mutation chama `reload()`.
 */
export function TransactionsView() {
  const { openTransactionModal } = useShell();
  const filters = useTransactionFilters();
  const referenceData = useTransactionsReferenceData();
  const { page, installmentTotals, loading, error, reload } = useTransactionsList(filters.state);
  const mutations = useTransactionMutations(reload);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<ClientTransaction | null>(null);
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

  function handleSortChange(column: string) {
    const current = filters.state.sort;
    const direction = current?.column === column && current.direction === "desc" ? "asc" : "desc";
    filters.setSort({ column, direction });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          {loading ? "Carregando…" : `${page.total} transação(ões) encontrada(s)`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setInstallmentOpen(true)} className="gap-1.5">
            <Layers3 className="size-3.5" aria-hidden="true" />
            Nova compra parcelada
          </Button>
          <Button type="button" variant="outline" onClick={() => setTransferOpen(true)} className="gap-1.5">
            <ArrowLeftRight className="size-3.5" aria-hidden="true" />
            Nova transferência
          </Button>
        </div>
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
          description: filters.hasActiveFilters
            ? "Ajuste os filtros ou crie uma nova transação."
            : "Comece registrando sua primeira transação.",
          actionLabel: "Criar transação",
          onAction: () => openTransactionModal(),
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
        rowActions={(row) => <RowActions row={row} onEdit={() => setEditing(row)} onDelete={() => setDeleting(row)} />}
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

type RowActionsProps = { row: ClientTransaction; onEdit: () => void; onDelete: () => void };

/** 28x28 icon-only (design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md, "DataTable"). Desabilitado pra pernas de TRANSFER. */
function RowActions({ row, onEdit, onDelete }: RowActionsProps) {
  const disabled = isTransferLeg(row);

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onEdit}
              disabled={disabled}
              aria-label="Editar transação"
              className="flex size-7 items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            />
          }
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{disabled ? "Transferências não são editáveis aqui" : "Editar"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              aria-label="Excluir transação"
              className="flex size-7 items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40"
            />
          }
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>{disabled ? "Transferências não são excluídas aqui" : "Excluir"}</TooltipContent>
      </Tooltip>
    </>
  );
}
