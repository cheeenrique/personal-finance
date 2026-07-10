"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Layers3, Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import { FormField } from "@/components/forms/form-field";
import {
  cancelInstallmentPurchaseAction,
  updateInstallmentPurchaseCategoryAction,
} from "@/modules/transactions/actions";
import { listCategoryTreeAction } from "@/modules/categories/actions";
import { CategoryType } from "@/generated/prisma/enums";
import type { CategoryTreeNode } from "@/modules/categories/types";
import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { InstallmentLineItemView, InstallmentPurchaseView } from "./types";

type InstallmentDetailsModalProps = {
  /** `null` = modal fechado. */
  purchase: InstallmentPurchaseView | null;
  onOpenChange: (open: boolean) => void;
};

/** Colunas da lista de parcelas — Parcela mostra `N/total` (docs/23-INSTALLMENTS.md). */
function buildInstallmentColumns(installmentsCount: number): DataTableColumn<InstallmentLineItemView>[] {
  return [
    {
      key: "installmentNumber",
      header: "Parcela",
      render: (item) => `${item.installmentNumber}/${installmentsCount}`,
    },
    { key: "date", header: "Vencimento", render: (item) => formatDateSaoPaulo(item.date) },
    {
      key: "amount",
      header: "Valor",
      align: "right",
      render: (item) => <span className="font-mono font-semibold text-foreground">{formatBRL(item.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (item) => (
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
            item.isPaid ? "bg-success/16 text-success" : "bg-secondary text-muted-foreground",
          )}
        >
          {item.isPaid ? "Paga" : "Futura"}
        </span>
      ),
    },
  ];
}

/** Achata a árvore de categorias EXPENSE — mesmo padrão de `installment-form-modal.tsx`. */
function flattenExpenseCategories(nodes: CategoryTreeNode[], depth = 0): EntitySelectOption[] {
  return nodes.flatMap((node) => [
    { value: node.id, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenExpenseCategories(node.children, depth + 1),
  ]);
}

/**
 * "Detalhes" de uma compra parcelada — lista das N parcelas (datas, valor,
 * status pago/futuro), sem paginação (docs/23-INSTALLMENTS.md, "Parcelas
 * Futuras"; docs/04-DESIGN_SYSTEM.md, "Paginação apenas em Transactions").
 * Reaproveita `FormModal` (par Modal/Drawer padrão do app) mesmo sem ser um
 * formulário — é o wrapper Dialog(desktop)/Sheet(mobile) genérico do
 * projeto, e `DataTable` já lista "Parcelamentos" entre seus consumidores.
 *
 * Categoria: vive nas `Transaction` filhas (não no pai). Trocar aqui aplica
 * `updateMany` em todas as parcelas vivas.
 *
 * "Cancelar parcelamento" (docs/23-INSTALLMENTS.md, "Cancelamento") só
 * aparece havendo parcela futura ainda viva (`!isPaid`) — mesmo racional de
 * "Quitar empréstimo" em `LoanDetailView` (só aparece com parcela pendente).
 * `ConfirmDialog` + `cancelInstallmentPurchaseAction` soft-deletam só as
 * parcelas futuras; pagas/vencidas ficam intactas. As parcelas são
 * Transactions — invalida os caches client-side de listagem de transação
 * (`invalidateAllTransactionLists`) além do `router.refresh()` do RSC.
 */
export function InstallmentDetailsModal({ purchase, onOpenChange }: InstallmentDetailsModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<EntitySelectOption[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [isSavingCategory, startSaveCategory] = useTransition();

  const open = purchase !== null;
  const hasFutureInstallments = purchase?.installments.some((installment) => !installment.isPaid) ?? false;
  const categoryDirty = Boolean(purchase && categoryId && categoryId !== purchase.categoryId);
  const columns = useMemo(
    () => buildInstallmentColumns(purchase?.installmentsCount ?? 0),
    [purchase?.installmentsCount],
  );

  const currentPurchaseId = purchase?.id ?? null;
  const [syncedPurchaseId, setSyncedPurchaseId] = useState(currentPurchaseId);
  if (currentPurchaseId !== syncedPurchaseId) {
    setSyncedPurchaseId(currentPurchaseId);
    setCategoryId(purchase?.categoryId ?? undefined);
    setCategoryError(null);
  }

  useEffect(() => {
    if (!open) return;

    Promise.resolve()
      .then(() => {
        setLoadingCategories(true);
        return listCategoryTreeAction();
      })
      .then((categoryResult) => {
        setCategoryOptions(
          categoryResult.success
            ? flattenExpenseCategories(
                categoryResult.data.filter((node) => node.type === CategoryType.EXPENSE),
              )
            : [],
        );
      })
      .finally(() => setLoadingCategories(false));
  }, [open]);

  async function handleCancel() {
    if (!purchase) return;

    const result = await cancelInstallmentPurchaseAction(purchase.id);
    if (!result.success) throw new Error(result.error.message);

    invalidateAllTransactionLists(queryClient);
    notifySuccess("Parcelamento cancelado");
    onOpenChange(false);
    router.refresh();
  }

  function handleSaveCategory() {
    if (!purchase || !categoryId) return;
    setCategoryError(null);

    startSaveCategory(async () => {
      const result = await updateInstallmentPurchaseCategoryAction(purchase.id, { categoryId });
      if (!result.success) {
        setCategoryError(result.error.message);
        return;
      }

      invalidateAllTransactionLists(queryClient);
      notifySuccess("Categoria atualizada");
      router.refresh();
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={purchase?.description ?? "Parcelas"}
      description={purchase ? `${purchase.installmentsCount} parcelas · ${purchase.cardName}` : undefined}
      size="wide"
    >
      <div className="flex flex-col gap-3">
        {purchase && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-secondary p-4">
              <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Valor total</span>
              <span className="font-mono text-[22px] font-bold text-foreground">
                {formatBRL(purchase.totalAmount)}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-secondary p-4">
              <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Pago</span>
              <span className="font-mono text-[22px] font-bold text-on-success">
                {formatBRL(purchase.paidAmount)}
              </span>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border bg-secondary p-4">
              <span className="text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Restante</span>
              <span className="font-mono text-[22px] font-bold text-on-warning">
                {formatBRL(purchase.remainingAmount)}
              </span>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <FormField
              label="Categoria"
              htmlFor="installment-details-category"
              error={categoryError ?? undefined}
            >
              <EntitySelect
                id="installment-details-category"
                options={categoryOptions}
                value={categoryId}
                onValueChange={(value) => {
                  setCategoryId(value);
                  setCategoryError(null);
                }}
                placeholder={loadingCategories ? "Carregando…" : "Selecione a categoria"}
                disabled={loadingCategories || isSavingCategory}
              />
            </FormField>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            {categoryDirty && (
              <Button
                type="button"
                size="sm"
                onClick={handleSaveCategory}
                disabled={isSavingCategory || loadingCategories}
              >
                {isSavingCategory ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Salvar categoria
              </Button>
            )}
            {hasFutureInstallments && (
              <Button type="button" variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
                <Ban className="size-4" aria-hidden="true" />
                Cancelar parcelamento
              </Button>
            )}
          </div>
        </div>

        <DataTable
          data={purchase?.installments ?? []}
          columns={columns}
          getRowId={(item) => String(item.installmentNumber)}
          emptyState={{
            icon: Layers3,
            title: "Nenhuma parcela encontrada",
          }}
        />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancelar "${purchase?.description ?? ""}"?`}
        description="As parcelas futuras ainda não vencidas são removidas. Parcelas já pagas ou vencidas continuam no histórico."
        confirmLabel="Cancelar parcelamento"
        onConfirm={handleCancel}
      />
    </FormModal>
  );
}
