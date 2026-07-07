import { Receipt } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { formatBRL } from "@/lib/money/format";
import { formatDateSaoPaulo } from "@/lib/date/format";
import type { PastInvoiceView } from "./types";

/**
 * Rótulo "mês de ano" a partir de `year`/`month` (1-12) já resolvidos — sem
 * conversão de timezone aqui: `year`/`month` já são valores de calendário
 * (vêm da `CardInvoice` armazenada ou já convertidos em `serialize.ts`), não
 * um instante UTC que precise de interpretação.
 */
function monthYearLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
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
        <li key={`${invoice.year}-${invoice.month}`} className="flex items-center justify-between px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="font-semibold text-foreground capitalize">
              {monthYearLabel(invoice.year, invoice.month)}
            </span>
            {invoice.isPaid && (
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
