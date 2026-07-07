"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, Layers3 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { cancelInstallmentPurchaseAction } from "@/modules/transactions/actions";
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

const COLUMNS: DataTableColumn<InstallmentLineItemView>[] = [
  { key: "installmentNumber", header: "Parcela", render: (item) => `${item.installmentNumber}` },
  { key: "date", header: "Vencimento", render: (item) => formatDateSaoPaulo(item.date) },
  {
    key: "amount",
    header: "Valor",
    align: "right",
    render: (item) => <span className="font-mono font-bold text-foreground">{formatBRL(item.amount)}</span>,
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

/**
 * "Detalhes" de uma compra parcelada — lista das N parcelas (datas, valor,
 * status pago/futuro), sem paginação (docs/23-INSTALLMENTS.md, "Parcelas
 * Futuras"; docs/04-DESIGN_SYSTEM.md, "Paginação apenas em Transactions").
 * Reaproveita `FormModal` (par Modal/Drawer padrão do app) mesmo sem ser um
 * formulário — é o wrapper Dialog(desktop)/Sheet(mobile) genérico do
 * projeto, e `DataTable` já lista "Parcelamentos" entre seus consumidores.
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

  const hasFutureInstallments = purchase?.installments.some((installment) => !installment.isPaid) ?? false;

  async function handleCancel() {
    if (!purchase) return;

    const result = await cancelInstallmentPurchaseAction(purchase.id);
    if (!result.success) throw new Error(result.error.message);

    invalidateAllTransactionLists(queryClient);
    notifySuccess("Parcelamento cancelado");
    onOpenChange(false);
    router.refresh();
  }

  return (
    <FormModal
      open={purchase !== null}
      onOpenChange={onOpenChange}
      title={purchase?.description ?? "Parcelas"}
      description={purchase ? `${purchase.installmentsCount} parcelas · ${purchase.cardName}` : undefined}
      size="wide"
    >
      <div className="flex flex-col gap-3">
        {hasFutureInstallments && (
          <div className="flex justify-end">
            <Button type="button" variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
              <Ban className="size-4" aria-hidden="true" />
              Cancelar parcelamento
            </Button>
          </div>
        )}

        <DataTable
          data={purchase?.installments ?? []}
          columns={COLUMNS}
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
