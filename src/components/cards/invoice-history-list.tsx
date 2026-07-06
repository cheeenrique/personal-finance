import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { TIMEZONE } from "@/lib/date/timezone";
import type { PastInvoiceView } from "./types";

function monthYearLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIMEZONE, month: "long", year: "numeric" }).format(
    new Date(isoDate),
  );
}

/** Histórico de faturas passadas — lista simples mês/total (docs/22, "Detalhe do Cartão"). */
export function InvoiceHistoryList({ invoices }: { invoices: PastInvoiceView[] }) {
  if (invoices.length === 0) {
    return <p className="text-sm font-medium text-muted-foreground">Sem faturas anteriores registradas.</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
      {invoices.map((invoice) => (
        <li key={invoice.periodEnd} className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="font-semibold text-foreground capitalize">{monthYearLabel(invoice.periodEnd)}</span>
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
