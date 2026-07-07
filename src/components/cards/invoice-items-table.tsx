"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Receipt, Trash2 } from "lucide-react";

import { DataTable } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { IconActionButton } from "@/components/shared/icon-action-button";
import { buildTransactionColumns } from "@/components/transactions/transaction-columns";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";
import { useInvoiceItemsList } from "./use-invoice-items-list";

type InvoiceItemsTableProps = {
  cardId: string;
  /** Range do ciclo aberto (`InvoiceView.periodStart`/`periodEnd`, ISO) — `periodEnd` é EXCLUSIVO, ver `modules/cards/cycle.ts`. */
  periodStart: string;
  periodEnd: string;
};

/**
 * Compras da fatura atual (docs/22-CREDIT_CARDS.md, "Detalhe do Cartão") —
 * MESMA `DataTable` + colunas (`buildTransactionColumns`) + paginação
 * server-side + editar/excluir de `AccountTransactionsHistory`
 * (`/accounts/[id]`), filtrando por `cardId` + range do ciclo atual em vez de
 * `accountId` + período livre (ver `use-invoice-items-list.ts`). Cada item da
 * fatura É uma `Transaction` real (`type=EXPENSE`) — `cardService.buildInvoice`
 * só DERIVA esta lista a partir dela (`modules/cards/repository.ts`
 * `findExpensesInRange`), não cria uma entidade própria.
 *
 * A listagem já traz o shape completo (`ClientTransaction`, mesma Server
 * Action de `/transactions`), então "Editar" abre o modal direto — sem o
 * fetch-sob-demanda via `getTransactionAction` que a versão anterior (baseada
 * em `InvoiceItemView`, um shape reduzido) precisava.
 *
 * Sem cache client-side pra invalidar sozinho aqui — `reload()` (TanStack
 * Query) atualiza a tabela, e `router.refresh()` refaz o Server Component da
 * página (fatura + KPIs usado/disponível do cartão), igual
 * `AccountTransactionsHistory.reloadAll`.
 */
export function InvoiceItemsTable({ cardId, periodStart, periodEnd }: InvoiceItemsTableProps) {
  const router = useRouter();
  const referenceData = useTransactionsReferenceData();

  const [currentPage, setCurrentPage] = useState(1);

  const { page, installmentTotals, loading, error, reload } = useInvoiceItemsList({
    cardId,
    periodStart,
    periodEnd,
    page: currentPage,
  });

  /** Além de invalidar a listagem client-side, força o Server Component da página a refazer `getInvoiceAction`/`listCardsAction` — fatura + KPIs (usado/disponível) são derivados das transactions, então editar/excluir aqui precisa refletir lá também. */
  function reloadAll() {
    reload();
    router.refresh();
  }

  const mutations = useTransactionMutations(reloadAll);

  const [editing, setEditing] = useState<ClientTransaction | null>(null);
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
          title: "Nenhuma compra nesta fatura",
          description: "As compras lançadas neste cartão dentro do ciclo atual aparecem aqui.",
        }}
        rowActions={(row) => (
          <>
            <IconActionButton icon={Pencil} label="Editar" onClick={() => setEditing(row)} />
            <IconActionButton icon={Trash2} tone="danger" label="Excluir" onClick={() => setDeleting(row)} />
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
