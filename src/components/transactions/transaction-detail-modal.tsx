"use client";

import { useState } from "react";

import { FormModal } from "@/components/shared/form-modal";
import { resolveCategoryDotColor } from "@/components/categories/category-config";
import { effectiveTransactionDate } from "./transaction-columns";
import { TransactionDetailHero } from "./transaction-detail-hero";
import { TransactionDetailTimeline, resolveStatusPill, STATUS_PILL_CLASSES } from "./transaction-detail-timeline";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { CategoryType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { ClientTransaction } from "@/modules/transactions/types";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";

type TransactionDetailModalProps = {
  transaction: ClientTransaction | null;
  onOpenChange: (open: boolean) => void;
  referenceData: TransactionsReferenceData;
  installmentTotals: Map<string, number>;
};

type DetailContentProps = {
  transaction: ClientTransaction;
  referenceData: TransactionsReferenceData;
  installmentTotals: Map<string, number>;
};

/**
 * Conteúdo do modal de detalhe, em blocos com hierarquia clara
 * (docs/06-SCREENS.md, "Transações"): hero de valor (`TransactionDetailHero`)
 * → grid 2×2 (Categoria/Conta-Cartão/Data efetiva/Situação) → Tags +
 * Observações (só quando existem) → linha do tempo (`TransactionDetailTimeline`).
 */
function DetailContent({ transaction, referenceData, installmentTotals }: DetailContentProps) {
  const category = transaction.categoryId ? referenceData.categoryById.get(transaction.categoryId) : undefined;
  const originName =
    (transaction.accountId && referenceData.accountNameById.get(transaction.accountId)) ||
    (transaction.cardId && referenceData.cardNameById.get(transaction.cardId)) ||
    "—";
  const tags = referenceData.tags.filter((tag) =>
    transaction.transactionTags.some((link) => link.tagId === tag.id),
  );
  const statusPill = resolveStatusPill(transaction);

  return (
    <div className="flex flex-col gap-5">
      <TransactionDetailHero transaction={transaction} installmentTotals={installmentTotals} />

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[10px] border border-border p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Categoria</span>
          {category ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: resolveCategoryDotColor(category.color, transaction.type as unknown as CategoryType),
                }}
                aria-hidden="true"
              />
              {category.name}
            </span>
          ) : (
            <span className="text-sm font-semibold text-muted-foreground">—</span>
          )}
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Conta / Cartão</span>
          <span className="text-sm font-semibold text-foreground">{originName}</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Data efetiva</span>
          <span className="font-mono text-sm font-semibold text-foreground">
            {formatDateSaoPaulo(effectiveTransactionDate(transaction))}
          </span>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Situação</span>
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[11px] font-extrabold",
              STATUS_PILL_CLASSES[statusPill.tone],
            )}
          >
            {statusPill.label}
          </span>
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                style={{ backgroundColor: `${tag.color}29`, color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {transaction.notes && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Observações</span>
          <p className="text-sm font-medium text-foreground">{transaction.notes}</p>
        </div>
      )}

      <TransactionDetailTimeline transaction={transaction} />
    </div>
  );
}

/**
 * Modal de VISUALIZAÇÃO (somente leitura) aberto pelo olhinho em
 * `TransactionRowActions` — diferente de `EditTransactionModal` (que edita).
 * Mostra os dados do lançamento + a timeline Criado/Vencimento/Pago, deixando
 * explícito se o pagamento foi adiantado ou atrasado em relação ao
 * vencimento (docs/03-DATABASE.md, `Transaction.paidAt`).
 *
 * Guarda a última transação recebida (mesmo padrão de `EditTransactionModal`)
 * pra manter o conteúdo visível durante a animação de fechamento do
 * `FormModal`, em vez de piscar vazio.
 */
export function TransactionDetailModal({
  transaction,
  onOpenChange,
  referenceData,
  installmentTotals,
}: TransactionDetailModalProps) {
  const [lastTransaction, setLastTransaction] = useState(transaction);
  if (transaction !== lastTransaction && transaction) {
    setLastTransaction(transaction);
  }

  const display = transaction ?? lastTransaction;

  return (
    <FormModal
      open={Boolean(transaction)}
      onOpenChange={onOpenChange}
      title="Detalhes da transação"
      description="Somente leitura — use o lápis para editar."
    >
      {display && (
        <DetailContent transaction={display} referenceData={referenceData} installmentTotals={installmentTotals} />
      )}
    </FormModal>
  );
}
