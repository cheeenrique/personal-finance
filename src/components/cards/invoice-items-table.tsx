import { Receipt } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import type { InvoiceItemView } from "./types";

const COLUMNS: DataTableColumn<InvoiceItemView>[] = [
  {
    key: "description",
    header: "Descrição",
    render: (item) => (
      <span className="flex items-center gap-2">
        <span className="truncate">{item.description}</span>
        {item.installmentNumber && (
          // Mesmo tom dessaturado de InstallmentBadge (transaction-type-badge.tsx) — não usa
          // --accent pra não colidir com o CTA "Pagar fatura" (accent) na mesma tela.
          <span className="inline-flex shrink-0 items-center rounded-full bg-orange-800/85 px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-orange-50">
            Parcela {item.installmentNumber}
          </span>
        )}
      </span>
    ),
  },
  { key: "date", header: "Data", render: (item) => formatDateSaoPaulo(item.date) },
  {
    key: "amount",
    header: "Valor",
    align: "right",
    render: (item) => <span className="font-mono text-destructive">{formatBRL(item.amount)}</span>,
  },
];

/** Compras da fatura atual — sem paginação (docs/22, "Detalhe do Cartão": "compras da fatura atual (DataTable, sem paginação)"). */
export function InvoiceItemsTable({ items }: { items: InvoiceItemView[] }) {
  return (
    <DataTable
      data={items}
      columns={COLUMNS}
      getRowId={(item) => item.id}
      emptyState={{
        icon: Receipt,
        title: "Nenhuma compra nesta fatura",
        description: "As compras lançadas neste cartão dentro do ciclo atual aparecem aqui.",
      }}
    />
  );
}
