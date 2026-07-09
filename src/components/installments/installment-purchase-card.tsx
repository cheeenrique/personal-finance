"use client";

import { Eye } from "lucide-react";

import { ProgressBar } from "@/components/dashboard/progress-bar";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import type { InstallmentPurchaseView } from "./types";

type InstallmentPurchaseCardProps = {
  purchase: InstallmentPurchaseView;
  onShowDetails: () => void;
};

/**
 * Card de compra parcelada — nome, progresso (N/M), valor pago/restante,
 * cartão (docs/23-INSTALLMENTS.md, "Listagem de Parcelamentos"; "Visual no
 * Dashboard"). Nunca mostra as N parcelas soltas aqui — é a compra ÚNICA
 * com progresso (docs/23-INSTALLMENTS.md, "Regra de UX Principal"); "Detalhes"
 * abre a lista completa das parcelas. Tom `accent` (laranja) — cor fixa de
 * Parcelamento (docs/04-DESIGN_SYSTEM.md, "Cores Financeiras").
 */
export function InstallmentPurchaseCard({ purchase, onShowDetails }: InstallmentPurchaseCardProps) {
  const percent = (purchase.paidCount / purchase.installmentsCount) * 100;

  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-border bg-card p-5", CARD_SHADOW_CLASS)}>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[15px] font-extrabold text-foreground">{purchase.description}</p>
        <span className="shrink-0 font-mono text-xs font-semibold text-muted-foreground">
          {purchase.paidCount}/{purchase.installmentsCount}
        </span>
      </div>

      <ProgressBar
        percent={percent}
        tone="accent"
        label={`${formatBRL(purchase.paidAmount)} pagos · ${formatBRL(purchase.remainingAmount)} restantes`}
      />

      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <div>
          <p className="font-semibold text-muted-foreground">Valor total</p>
          <p className="font-mono font-semibold text-foreground">{formatBRL(purchase.totalAmount)}</p>
        </div>
        <p className="truncate text-[11.5px] font-semibold text-muted-foreground">{purchase.cardName}</p>
      </div>

      <Button
        type="button"
        variant="neutral"
        onClick={onShowDetails}
        className="mt-1 h-9 w-full gap-[7px] rounded-[10px] px-3.5 text-[13px] font-bold"
      >
        <Eye className="size-[15px]" strokeWidth={2} aria-hidden="true" />
        Detalhes
      </Button>
    </div>
  );
}
