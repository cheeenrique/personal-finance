"use client";

import { useState } from "react";
import { CalendarCheck2, CalendarClock, CalendarPlus, CircleDashed, Receipt, type LucideIcon } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { TransactionTypeBadge, TransactionInlineBadges } from "@/components/shared/badges/transaction-type-badge";
import { resolveCategoryDotColor } from "@/components/categories/category-config";
import { amountAppearance } from "./transaction-columns";
import { isCardTransaction } from "./use-transaction-mutations";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { TransactionType, CategoryType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { ClientTransaction } from "@/modules/transactions/types";
import type { TransactionsReferenceData } from "./use-transactions-reference-data";

type TransactionDetailModalProps = {
  transaction: ClientTransaction | null;
  onOpenChange: (open: boolean) => void;
  referenceData: TransactionsReferenceData;
  installmentTotals: Map<string, number>;
};

type TimelineTone = "neutral" | "structural" | "success" | "warning";

/** Mesma paleta de "Cores Financeiras"/badges do resto do app — estrutural (primary) pro vencimento, success/warning pro status de pagamento. */
const TONE_CLASSES: Record<TimelineTone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  structural: "bg-primary/16 text-on-primary",
  success: "bg-success/16 text-on-success",
  warning: "bg-warning/16 text-on-warning",
};

type TimelineStep = { icon: LucideIcon; label: string; value: string; hint?: string; tone: TimelineTone };

/** Diferença em dias corridos (calendário America/Sao_Paulo) entre `date` e `reference` — positivo quando `date` é depois de `reference`. */
function diffCalendarDaysSP(date: Date, reference: Date): number {
  const dateParts = calendarPartsSP(date);
  const referenceParts = calendarPartsSP(reference);
  const dateStart = startOfDaySP(dateParts.year, dateParts.month, dateParts.day).getTime();
  const referenceStart = startOfDaySP(referenceParts.year, referenceParts.month, referenceParts.day).getTime();
  return Math.round((dateStart - referenceStart) / 86_400_000);
}

/** "Pago 5 dias antes/depois do vencimento" — só chamado com um `paidAt` EXATO, nunca com o fallback aproximado (ver `resolvePaidStep`). */
function paymentTimingHint(paidAt: Date, dueDate: Date): string {
  const diff = diffCalendarDaysSP(paidAt, dueDate);
  if (diff === 0) return "Pago no dia do vencimento";
  const days = Math.abs(diff);
  const unit = days === 1 ? "dia" : "dias";
  return diff < 0 ? `Pago ${days} ${unit} antes do vencimento` : `Pago ${days} ${unit} depois do vencimento`;
}

/**
 * Passo "Pago em" da timeline — 4 estados possíveis:
 * - Transação de CARTÃO (`isCardTransaction`): nunca fala "pago"/"pendente"
 *   por linha — mostra "Faturado", deixando explícito que o pagamento real é
 *   o da fatura (`payInvoiceAction`), não desta linha (decisão confirmada
 *   pelo dono do produto, mesma regra de `TransactionRowActions`/
 *   `EditTransactionModal` escondendo o controle de marcar paga pra cartão).
 * - Pendente (`!isPaid`, transação de CONTA): sem data, tom warning (mesma
 *   cor da pill "Pendente" de `TransactionInlineBadges`).
 * - Pago com `paidAt` exato: mostra a data + "adiantado/atrasado/no dia"
 *   comparado com o vencimento (docs/03-DATABASE.md, `Transaction.paidAt`).
 * - Pago sem `paidAt` (lançamento anterior a este campo existir, ou nasceu
 *   pago e nunca passou pela transição pendente→paga — ver
 *   `modules/transactions/service.ts` `resolvePaidAtOnUpdate`): cai em
 *   `updatedAt` como melhor aproximação disponível, marcado como tal — nunca
 *   apresenta uma data de pagamento como exata sem ela realmente ser.
 */
function resolvePaidStep(transaction: ClientTransaction): TimelineStep {
  if (isCardTransaction(transaction)) {
    return {
      icon: Receipt,
      label: "Faturado",
      value: "Cobrança confirmada",
      hint: "Pagamento controlado pela fatura do cartão, não por esta linha",
      tone: "structural",
    };
  }

  if (!transaction.isPaid) {
    return { icon: CircleDashed, label: "Pago em", value: "Pendente", hint: "Ainda não foi paga", tone: "warning" };
  }

  if (transaction.paidAt) {
    return {
      icon: CalendarCheck2,
      label: "Pago em",
      value: formatDateSaoPaulo(transaction.paidAt),
      hint: paymentTimingHint(transaction.paidAt, transaction.date),
      tone: "success",
    };
  }

  return {
    icon: CalendarCheck2,
    label: "Pago em",
    value: `≈ ${formatDateSaoPaulo(transaction.updatedAt)}`,
    hint: "Data aproximada — lançamento anterior a este registro",
    tone: "success",
  };
}

function TimelineRow({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  const Icon = step.icon;

  return (
    <div className={cn("relative flex gap-3", !isLast && "pb-5")}>
      {!isLast && <div className="absolute top-8 bottom-0 left-4 w-px bg-border" aria-hidden="true" />}
      <div
        className={cn(
          "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full",
          TONE_CLASSES[step.tone],
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
          {step.label}
        </span>
        <span className="font-mono text-sm font-bold text-foreground">{step.value}</span>
        {step.hint && <span className="text-[12px] font-medium text-muted-foreground">{step.hint}</span>}
      </div>
    </div>
  );
}

/** Tipo de exibição — perna de transferência mostra badge "Transferência" mesmo persistida como EXPENSE/INCOME (mesma regra de `recent-transactions-table.tsx`). */
function displayType(transaction: ClientTransaction): TransactionType {
  return transaction.transferId ? TransactionType.TRANSFER : transaction.type;
}

type DetailContentProps = {
  transaction: ClientTransaction;
  referenceData: TransactionsReferenceData;
  installmentTotals: Map<string, number>;
};

function DetailContent({ transaction, referenceData, installmentTotals }: DetailContentProps) {
  const { className: amountClassName, sign } = amountAppearance(transaction);
  const category = transaction.categoryId ? referenceData.categoryById.get(transaction.categoryId) : undefined;
  const originName =
    (transaction.accountId && referenceData.accountNameById.get(transaction.accountId)) ||
    (transaction.cardId && referenceData.cardNameById.get(transaction.cardId)) ||
    "—";
  const tags = referenceData.tags.filter((tag) =>
    transaction.transactionTags.some((link) => link.tagId === tag.id),
  );

  const steps: TimelineStep[] = [
    { icon: CalendarPlus, label: "Criado em", value: formatDateSaoPaulo(transaction.createdAt), tone: "neutral" },
    { icon: CalendarClock, label: "Vencimento", value: formatDateSaoPaulo(transaction.date), tone: "structural" },
    resolvePaidStep(transaction),
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <TransactionTypeBadge type={displayType(transaction)} />
        <TransactionInlineBadges
          row={{
            type: transaction.type,
            transferId: transaction.transferId,
            isPaid: transaction.isPaid,
            installmentNumber: transaction.installmentPurchaseId ? transaction.installmentNumber : null,
            installmentsCount: transaction.installmentPurchaseId
              ? (installmentTotals.get(transaction.installmentPurchaseId) ?? transaction.installmentNumber)
              : null,
            loanId: transaction.loanId,
          }}
        />
      </div>

      <div>
        <p className={cn("font-mono text-2xl font-extrabold", amountClassName)}>
          {sign}
          {formatBRL(transaction.amount)}
        </p>
        <p className="text-sm font-bold text-foreground">{transaction.description}</p>
      </div>

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
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-bold text-muted-foreground uppercase">Tags</span>
        {tags.length > 0 ? (
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
        ) : (
          <span className="text-sm font-medium text-muted-foreground">Nenhuma tag</span>
        )}
      </div>

      {transaction.notes && (
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-bold text-muted-foreground uppercase">Observações</span>
          <p className="text-sm font-medium text-foreground">{transaction.notes}</p>
        </div>
      )}

      <div className="flex flex-col border-t border-border pt-4">
        <span className="mb-3 text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
          Linha do tempo
        </span>
        {steps.map((step, index) => (
          <TimelineRow key={step.label} step={step} isLast={index === steps.length - 1} />
        ))}
      </div>
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
