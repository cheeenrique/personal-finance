"use client";

import { Layers3 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
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
 */
export function InstallmentDetailsModal({ purchase, onOpenChange }: InstallmentDetailsModalProps) {
  return (
    <FormModal
      open={purchase !== null}
      onOpenChange={onOpenChange}
      title={purchase?.description ?? "Parcelas"}
      description={purchase ? `${purchase.installmentsCount} parcelas · ${purchase.cardName}` : undefined}
      size="wide"
    >
      <DataTable
        data={purchase?.installments ?? []}
        columns={COLUMNS}
        getRowId={(item) => String(item.installmentNumber)}
        emptyState={{
          icon: Layers3,
          title: "Nenhuma parcela encontrada",
        }}
      />
    </FormModal>
  );
}
