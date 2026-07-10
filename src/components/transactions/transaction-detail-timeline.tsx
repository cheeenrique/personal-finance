import { CalendarCheck2, CalendarClock, CalendarPlus, CircleDashed, Receipt, type LucideIcon } from "lucide-react";

import { formatDateSaoPaulo } from "@/lib/date/format";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { cn } from "@/lib/utils";
import { isCardTransaction } from "./use-transaction-mutations";
import type { ClientTransaction } from "@/modules/transactions/types";

type TimelineTone = "neutral" | "structural" | "success" | "warning";

/** Mesma paleta de "Cores Financeiras"/badges do resto do app — estrutural (primary) pro vencimento, success/warning pro status de pagamento. */
const TONE_CLASSES: Record<TimelineTone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  structural: "bg-primary/16 text-on-primary",
  success: "bg-success/16 text-on-success",
  warning: "bg-warning/16 text-on-warning",
};

type TimelineStep = { icon: LucideIcon; label: string; value: string; hint?: string; tone: TimelineTone };

export type StatusPillTone = "success" | "warning" | "structural";

export const STATUS_PILL_CLASSES: Record<StatusPillTone, string> = {
  structural: "bg-primary/16 text-on-primary",
  success: "bg-success/16 text-on-success",
  warning: "bg-warning/16 text-on-warning",
};

/** Pill "Situação" do grid 2×2 do modal de detalhe — mesma classificação em 3 estados de `resolvePaidStep` abaixo (cartão ⇒ Faturado, pendente ⇒ Pendente, resto ⇒ Pago), rótulo mais curto por não estar numa timeline ("Pago em" vira só "Pago"). */
export function resolveStatusPill(transaction: ClientTransaction): { label: string; tone: StatusPillTone } {
  if (isCardTransaction(transaction)) return { label: "Faturado", tone: "structural" };
  if (!transaction.isPaid) return { label: "Pendente", tone: "warning" };
  return { label: "Pago", tone: "success" };
}

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
        <span className="font-mono text-sm font-semibold text-foreground">{step.value}</span>
        {step.hint && <span className="text-[12px] font-medium text-muted-foreground">{step.hint}</span>}
      </div>
    </div>
  );
}

/**
 * Seção "Linha do tempo" do modal de detalhe: Criado em → Vencimento →
 * Pago/Faturado/Pendente, com linha vertical + dots tonalizados (ver
 * `TONE_CLASSES`). Lógica de resolução de estado (`resolvePaidStep`) mantida
 * 1:1 — só a posição no arquivo mudou (extraído de `transaction-detail-modal.tsx`
 * pra manter os arquivos ≤300 linhas, docs/05-naming-size.md).
 */
export function TransactionDetailTimeline({ transaction }: { transaction: ClientTransaction }) {
  const steps: TimelineStep[] = [
    { icon: CalendarPlus, label: "Criado em", value: formatDateSaoPaulo(transaction.createdAt), tone: "neutral" },
    { icon: CalendarClock, label: "Vencimento", value: formatDateSaoPaulo(transaction.date), tone: "structural" },
    resolvePaidStep(transaction),
  ];

  return (
    <div className="flex flex-col border-t border-border pt-4">
      <span className="mb-3 text-[11px] font-extrabold tracking-wide text-muted-foreground uppercase">
        Linha do tempo
      </span>
      {steps.map((step, index) => (
        <TimelineRow key={step.label} step={step} isLast={index === steps.length - 1} />
      ))}
    </div>
  );
}
