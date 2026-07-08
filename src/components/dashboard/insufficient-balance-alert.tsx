import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import type { InsufficientBalanceItem } from "@/modules/accounts/types";
import { TruncatedText } from "@/components/tables/truncated-text";
import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { formatDateShortSaoPaulo } from "@/lib/date/format";
import { CARD_SHADOW_CLASS, cn } from "@/lib/utils";

type InsufficientBalanceAlertProps = {
  deficitTotal: string;
  items: InsufficientBalanceItem[];
};

/**
 * Alerta no TOPO do Dashboard, acima dos KPIs (junto/acima de `AlertsSection`)
 * — só aparece quando o saldo de alguma conta não cobre suas despesas
 * previstas (EXPENSE, `isPaid=false`, vencidas + mês corrente). Waterfall por
 * conta+data já resolvido em `modules/accounts/service.ts`
 * `getInsufficientBalanceReport` — este componente só formata/exibe.
 */
export function InsufficientBalanceAlert({ deficitTotal, items }: InsufficientBalanceAlertProps) {
  if (items.length === 0) return null;

  const pendingLabel = items.length === 1 ? "fatura pendente" : "faturas pendentes";

  return (
    <div className={cn("rounded-xl border border-destructive/40 bg-destructive/5", CARD_SHADOW_CLASS)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-destructive/20 px-[18px] py-[15px]">
        <div className="flex items-start gap-3">
          <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-destructive/16 text-destructive">
            <TriangleAlert className="size-[18px]" aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-extrabold text-foreground">Saldo insuficiente</p>
            <p className="text-[13px] font-medium text-muted-foreground">
              {items.length} {pendingLabel} sem saldo para pagamento:
            </p>
          </div>
        </div>

        <span className="shrink-0 font-mono text-[13px] font-semibold text-destructive">
          Déficit total: {formatBRL(deficitTotal)}
        </span>
      </div>

      <ul className="divide-y divide-destructive/15 px-[18px]">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0 space-y-0.5">
              <TruncatedText text={item.description} className="text-[13.5px] font-bold text-foreground" />
              <p className="text-[12px] font-medium text-muted-foreground">
                {formatDateShortSaoPaulo(item.date)} · {item.accountName}
              </p>
            </div>

            <div className="shrink-0 space-y-0.5 text-right">
              <p className="font-mono text-[13.5px] font-semibold text-destructive">{formatBRL(item.amount)}</p>
              <p className="font-mono text-[12px] font-medium text-destructive">Falta: {formatBRL(item.falta)}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-[18px] pb-[18px] pt-1">
        <Link href="/accounts" className={buttonVariants({ variant: "destructive", className: "w-full" })}>
          Ir para contas
        </Link>
      </div>
    </div>
  );
}
