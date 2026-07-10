"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";

import { DataTable } from "@/components/tables/data-table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EntitySelect } from "@/components/forms/entity-select";
import { buildTransactionColumns } from "@/components/transactions/transaction-columns";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";
import { useInvoiceItemsList } from "./use-invoice-items-list";

const ALL_CATEGORIES_VALUE = "__ALL__";

type InvoiceItemsTableProps = {
  cardId: string;
  /** Range do período selecionado no segmented control acima (`use-card-period-filter.ts`) — `YYYY-MM-DD`, `undefined` num dos lados = sem limite. */
  dateFrom?: string;
  dateTo?: string;
  /** Segmented de período renderizado no MESMO slot de filtros, ao lado da categoria (fica um do lado do outro em vez de empilhado). */
  periodFilter?: ReactNode;
};

/**
 * Compras do cartão dentro do período selecionado (docs/22-CREDIT_CARDS.md,
 * "Detalhe do Cartão") — MESMA `DataTable` + colunas
 * (`buildTransactionColumns`) + paginação server-side + editar/excluir de
 * `AccountTransactionsHistory` (`/accounts/[id]`), filtrando por `cardId` +
 * range livre em vez de `accountId` + período livre (ver
 * `use-invoice-items-list.ts`). Cada item É uma `Transaction` real
 * (`type=EXPENSE`) — sem entidade própria.
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
 *
 * Filtro por categoria acima da tabela (`filters` slot do `DataTable`,
 * mesmo `EntitySelect` bare de `installments-board.tsx` — sem barra
 * multi-filtro, essa tela só tem esse dropdown) — trocar de categoria reseta
 * a página pro mesmo padrão de `AccountTransactionsHistory`. O período
 * (segmented control) vive um nível acima, em `card-detail-view.tsx`.
 */
export function InvoiceItemsTable({ cardId, dateFrom, dateTo, periodFilter }: InvoiceItemsTableProps) {
  const router = useRouter();
  const referenceData = useTransactionsReferenceData();

  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);

  // Trocar de categoria ou de período invalida a página atual — mesmo ajuste
  // durante o render (não `useEffect`) de `AccountTransactionsHistory`.
  const [prevCategoryId, setPrevCategoryId] = useState(categoryId);
  const [prevRange, setPrevRange] = useState({ dateFrom, dateTo });
  if (categoryId !== prevCategoryId || dateFrom !== prevRange.dateFrom || dateTo !== prevRange.dateTo) {
    setPrevCategoryId(categoryId);
    setPrevRange({ dateFrom, dateTo });
    setCurrentPage(1);
  }

  const { page, installmentTotals, loading, error, reload } = useInvoiceItemsList({
    cardId,
    categoryId,
    dateFrom,
    dateTo,
    page: currentPage,
  });

  /** Além de invalidar a listagem client-side, força o Server Component da página a refazer `getInvoiceAction`/`listCardsAction` — fatura + KPIs (usado/disponível) são derivados das transactions, então editar/excluir aqui precisa refletir lá também. */
  function reloadAll() {
    reload();
    router.refresh();
  }

  const mutations = useTransactionMutations(reloadAll);

  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [viewing, setViewing] = useState<ClientTransaction | null>(null);
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
          title: "Nenhuma compra no período",
          description: "As compras lançadas neste cartão dentro do período selecionado aparecem aqui.",
        }}
        filters={
          <div className="flex flex-wrap items-center gap-3">
            {periodFilter}
            <EntitySelect
              aria-label="Filtrar por categoria"
              options={[{ value: ALL_CATEGORIES_VALUE, label: "Todas as categorias" }, ...referenceData.categoryOptions]}
              value={categoryId ?? ALL_CATEGORIES_VALUE}
              onValueChange={(value) => setCategoryId(value === ALL_CATEGORIES_VALUE ? undefined : value)}
              className="h-[38px] w-auto min-w-[200px]"
              disabled={referenceData.loading}
            />
          </div>
        }
        rowActions={(row) => (
          <TransactionRowActions
            row={row}
            onView={() => setViewing(row)}
            onMarkPaid={() => void mutations.markPaid(row)}
            onEdit={() => setEditing(row)}
            onDelete={() => setDeleting(row)}
          />
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
        description="A compra vai para a lixeira — o toast de confirmação traz um botão de desfazer."
        onConfirm={async () => {
          if (deleting) await mutations.deleteOne(deleting);
          setDeleting(null);
        }}
      />
    </>
  );
}
