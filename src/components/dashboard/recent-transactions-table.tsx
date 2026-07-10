"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Receipt } from "lucide-react";

import type { ClientTransaction, RecentTransactionRowClient } from "@/modules/transactions/types";
import { getTransactionAction } from "@/modules/transactions/actions";
import { CategoryType, TransactionType } from "@/generated/prisma/enums";
import { DataTable, type DataTableColumn } from "@/components/tables/data-table";
import { buttonVariants } from "@/components/ui/button";
import { TruncatedText } from "@/components/tables/truncated-text";
import { TransactionInlineBadges } from "@/components/shared/badges/transaction-type-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EditTransactionModal } from "@/components/transactions/edit-transaction-modal";
import { TransactionDetailModal } from "@/components/transactions/transaction-detail-modal";
import { TransactionRowActions } from "@/components/transactions/transaction-row-actions";
import { useTransactionsReferenceData } from "@/components/transactions/use-transactions-reference-data";
import { buildTransactionDraft, isTransferLeg, useTransactionMutations } from "@/components/transactions/use-transaction-mutations";
import { useShell } from "@/components/providers/shell-provider";
import { resolveCategoryDotColor } from "@/components/categories/category-config";
import { formatBRL } from "@/lib/money/format";
import { formatDateShortSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

/** Tipo de exibição — perna de transferência mostra badge "Transfer" mesmo persistida como EXPENSE/INCOME (docs/06-SCREENS.md, "Linha de TRANSFER"). */
function displayType(row: RecentTransactionRowClient): TransactionType {
  return row.transferId ? TransactionType.TRANSFER : row.type;
}

/**
 * Descrição + badges inline (parcela/transferência/pendência) + data curta
 * abaixo — layout do preview do Dashboard (design/Personal Finance
 * App.dc.html, "últimas transações"), diferente da tabela completa de
 * `/transactions` (que tem coluna de Data e Ações próprias).
 */
function DescriptionCell({ row }: { row: RecentTransactionRowClient }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <TruncatedText
          text={row.description}
          className="max-w-[180px] flex-1 text-[13.5px] font-extrabold text-foreground sm:max-w-[240px]"
        />
        <TransactionInlineBadges row={row} />
      </div>
      <span className="font-mono text-[11px] text-muted-foreground">{formatDateShortSaoPaulo(row.date)}</span>
    </div>
  );
}

/**
 * Categoria só existe em transação INCOME/EXPENSE (transferência e pagamento
 * de fatura não têm — mostram "—"), então `row.type` aqui equivale a
 * `CategoryType` pra efeito do fallback de cor (mesma regra de
 * `category-row.tsx` quando a categoria não tem `color` próprio).
 */
function CategoryCell({ row }: { row: RecentTransactionRowClient }) {
  if (!row.categoryName) return <span className="text-[12.5px] font-semibold text-muted-foreground">—</span>;

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold">
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: resolveCategoryDotColor(row.categoryColor, row.type as unknown as CategoryType) }}
        aria-hidden="true"
      />
      {row.categoryName}
    </span>
  );
}

function AmountCell({ row }: { row: RecentTransactionRowClient }) {
  const type = displayType(row);
  const isNegative = type === TransactionType.EXPENSE || type === TransactionType.CARD_PAYMENT;
  const value = row.amount;

  return (
    <span
      className={cn(
        "font-mono text-[13.5px] font-semibold",
        type === TransactionType.INCOME && "text-success",
        isNegative && "text-destructive",
        type === TransactionType.TRANSFER && "text-on-transfer",
      )}
    >
      {isNegative ? "− " : type === TransactionType.INCOME ? "+ " : ""}
      {formatBRL(value)}
    </span>
  );
}

const COLUMNS: DataTableColumn<RecentTransactionRowClient>[] = [
  {
    key: "description",
    header: "Descrição",
    render: (row) => <DescriptionCell row={row} />,
  },
  {
    key: "category",
    header: "Categoria",
    render: (row) => <CategoryCell row={row} />,
  },
  {
    key: "source",
    header: "Conta / Cartão",
    render: (row) => (
      <span className="text-[12.5px] font-semibold text-muted-foreground">
        {row.accountName ?? row.cardName ?? "—"}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Valor",
    align: "right",
    render: (row) => <AmountCell row={row} />,
  },
];

type RecentTransactionsTableProps = {
  transactions: RecentTransactionRowClient[];
};

/** Detalhe aberto pelo olhinho — junto com o shape completo, carrega o total de parcelas da linha resumida (ver comentário de `fullTransactionsQuery` abaixo: `getTransactionAction` não traz essa contagem agregada). */
type ViewingDetail = { transaction: ClientTransaction; installmentsCount: number | null };

/**
 * Preview "Últimas Transações" do Dashboard (docs/11-DASHBOARD.md, "6.
 * Últimas Transações") — sem paginação, sem busca/filtro (isso vive em
 * `/transactions`). Link "Ver todas" leva pra lá.
 *
 * Editar/ver detalhes/duplicar (docs/50-AUDITORIA-BACKLOG.md F9) precisam do
 * shape completo da transação (`ClientTransaction`: categoryId/accountId/
 * cardId/notas/tags) — a listagem resumida do dashboard
 * (`transactionService.listRecentForDashboard`) só traz nomes já resolvidos,
 * sem esses ids (ela existe pra ESSE preview, não pra edição). Em vez de
 * inflar a query do módulo só pra alimentar esta tabela pequena (5 linhas),
 * busca sob demanda via `getTransactionAction` — mesmo padrão descrito no
 * JSDoc de `transactionService.getTransaction` ("insumo do fluxo de edição a
 * partir de listas que só carregam um subconjunto de campos").
 */
export function RecentTransactionsTable({ transactions }: RecentTransactionsTableProps) {
  const router = useRouter();
  const { openTransactionModal, duplicateTransaction } = useShell();
  const referenceData = useTransactionsReferenceData();

  const ids = transactions.map((transaction) => transaction.id);
  const fullTransactionsQuery = useQuery({
    queryKey: ["recent-transactions-full", ids],
    queryFn: async () => {
      const results = await Promise.all(ids.map((id) => getTransactionAction(id)));
      const byId = new Map<string, ClientTransaction>();
      results.forEach((result, index) => {
        if (result.success) byId.set(ids[index], result.data);
      });
      return byId;
    },
    enabled: ids.length > 0,
  });

  const [editing, setEditing] = useState<ClientTransaction | null>(null);
  const [viewing, setViewing] = useState<ViewingDetail | null>(null);
  const [deleting, setDeleting] = useState<ClientTransaction | null>(null);

  /** Server Component (RSC) da página — editar/excluir/marcar como paga aqui precisam refletir nos KPIs/cards do resto do Dashboard, não só nesta tabela (mesmo padrão de `invoice-items-table.tsx`: `useTransactionMutations` já invalida o cache client-side, falta o `router.refresh()` do RSC). */
  function reloadAll() {
    router.refresh();
  }
  const mutations = useTransactionMutations(reloadAll);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-extrabold text-foreground">Últimas transações</h3>
        <Link href="/transactions" className={cn(buttonVariants({ variant: "neutral", size: "sm" }))}>
          Ver todas
        </Link>
      </div>

      <DataTable
        data={transactions}
        columns={COLUMNS}
        getRowId={(row) => row.id}
        emptyState={{
          icon: Receipt,
          title: "Nenhuma movimentação ainda",
          description: "Registre sua primeira receita ou despesa para começar.",
          actionLabel: "Criar primeira transação",
          onAction: () => openTransactionModal(),
        }}
        rowActions={(row) => {
          const full = fullTransactionsQuery.data?.get(row.id);
          // Ainda buscando (ou o fetch desta linha falhou) — célula fica em
          // branco por um instante em vez de travar o clique com dado
          // incompleto; 5 leituras pontuais, sem spinner dedicado (mesmo
          // "silencioso" do restante do preview, que não tem loading próprio).
          if (!full) return null;

          return (
            <TransactionRowActions
              row={full}
              onView={() => setViewing({ transaction: full, installmentsCount: row.installmentsCount })}
              onMarkPaid={() => void mutations.markPaid(full)}
              onEdit={() => setEditing(full)}
              onDuplicate={() => duplicateTransaction(buildTransactionDraft(full))}
              onDelete={() => setDeleting(full)}
            />
          );
        }}
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
        transaction={viewing?.transaction ?? null}
        onOpenChange={(open) => {
          if (!open) setViewing(null);
        }}
        referenceData={referenceData}
        installmentTotals={
          viewing?.transaction.installmentPurchaseId && viewing.installmentsCount != null
            ? new Map([[viewing.transaction.installmentPurchaseId, viewing.installmentsCount]])
            : new Map()
        }
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
    </div>
  );
}
