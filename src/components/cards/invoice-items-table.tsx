"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Receipt, Trash2 } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import { getTransactionAction } from "@/modules/transactions/actions";
import type { ClientTransaction } from "@/modules/transactions/types";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { notifyError } from "@/lib/toast";
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

/**
 * Compras da fatura atual — sem paginação (docs/22, "Detalhe do Cartão":
 * "compras da fatura atual (DataTable, sem paginação)").
 *
 * Editar/excluir reaproveita o MESMO par `EditTransactionModal` +
 * `useTransactionMutations` de `/transactions` e `/accounts/[id]`
 * (`account-transactions-history.tsx`): cada item da fatura É uma
 * `Transaction` real — `cardService.buildInvoice` só DERIVA esta lista a
 * partir dela (ver `modules/cards/repository.ts` `findExpensesInRange`), não
 * cria uma entidade própria. `InvoiceItemView` (shape de leitura da fatura)
 * não carrega categoria/notas/isPaid/tags — por isso "Editar" busca a
 * `Transaction` completa sob demanda via `getTransactionAction` antes de
 * abrir o modal, em vez de inflar `Invoice`/`InvoiceItem` (módulo cards) com
 * campos que só a edição usa (a leitura da fatura não devia carregar payload
 * de edição que nunca lê).
 *
 * Parcelas de `InstallmentPurchase` são editáveis/excluíveis igual a
 * qualquer outra compra — mesmo comportamento que já existe em
 * `/transactions` (`transactions-view.tsx`: só pernas de TRANSFER são
 * desabilitadas lá, e itens de fatura nunca são TRANSFER, sempre EXPENSE).
 * `updateTransactionAction` não toca `installmentPurchaseId`/
 * `installmentNumber`, então editar uma parcela não quebra o parcelamento;
 * excluir uma parcela é soft-delete com undo, igual a qualquer transação.
 *
 * Sem cache client-side pra invalidar aqui — a fatura chega como prop de
 * Server Component (`app/(app)/cards/[id]/page.tsx`), então `router.refresh()`
 * já refaz `getInvoiceAction`/`listCardsAction` e traz fatura + resumo do
 * cartão (usado/disponível) atualizados na mesma leitura.
 */
export function InvoiceItemsTable({ items }: { items: InvoiceItemView[] }) {
  const router = useRouter();
  const referenceData = useTransactionsReferenceData();
  const mutations = useTransactionMutations(() => router.refresh());

  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [deleting, setDeleting] = useState<InvoiceItemView | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);

  async function handleEdit(item: InvoiceItemView) {
    setPendingEditId(item.id);
    const result = await getTransactionAction(item.id);
    setPendingEditId(null);

    if (!result.success) {
      notifyError(result.error.message);
      return;
    }
    setEditing(result.data);
  }

  return (
    <>
      <DataTable
        data={items}
        columns={COLUMNS}
        getRowId={(item) => item.id}
        emptyState={{
          icon: Receipt,
          title: "Nenhuma compra nesta fatura",
          description: "As compras lançadas neste cartão dentro do ciclo atual aparecem aqui.",
        }}
        rowActions={(item) => (
          <>
            <IconActionButton
              icon={Pencil}
              label="Editar"
              onClick={() => void handleEdit(item)}
              disabled={pendingEditId === item.id}
            />
            <IconActionButton icon={Trash2} tone="danger" label="Excluir" onClick={() => setDeleting(item)} />
          </>
        )}
      />

      <EditTransactionModal
        transaction={editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        referenceData={referenceData}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={`Excluir "${deleting?.description ?? ""}"?`}
        description="A compra vai para a lixeira — o toast de confirmação traz um botão de desfazer."
        onConfirm={async () => {
          if (deleting) await mutations.deleteOne(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}
