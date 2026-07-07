import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { TIMEZONE } from "@/lib/date/timezone";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import type { PastInvoiceView } from "./types";

function monthYearLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, month: "long", year: "numeric" }).format(
    new Date(isoDate),
  );
}

/** Meia-noite de hoje em America/Sao_Paulo — mesmo instante usado pra construir `dueDate` (`modules/cards/cycle.ts`). */
function startOfTodaySP(): Date {
  const { year, month, day } = calendarPartsSP(new Date());
  return startOfDaySP(year, month, day);
}

/** Fatura de ciclo fechado com vencimento já no passado = paga (o dono não guarda pagamento explícito de fatura). */
function isInvoicePaid(dueDate: string): boolean {
  return new Date(dueDate) < startOfTodaySP();
}

/** Histórico de faturas passadas — lista simples mês/total (docs/22, "Detalhe do Cartão"). */
export function InvoiceHistoryList({ invoices }: { invoices: PastInvoiceView[] }) {
  if (invoices.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Sem faturas anteriores"
        description="Faturas de ciclos já fechados aparecem aqui."
        className="min-h-40 py-8"
      />
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {invoices.map((invoice) => (
        <li key={invoice.periodEnd} className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-foreground capitalize">{monthYearLabel(invoice.periodEnd)}</span>
            {isInvoicePaid(invoice.dueDate) && (
              <span className="inline-flex items-center rounded-full bg-success/16 px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-success">
                Paga
              </span>
            )}
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              vence {formatDateSaoPaulo(invoice.dueDate)}
            </span>
            <span className="font-mono font-bold text-foreground">{formatBRL(invoice.total)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
