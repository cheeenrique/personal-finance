import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { TransactionTypeBadge, TransactionInlineBadges } from "@/components/shared/badges/transaction-type-badge";
import { amountAppearance } from "./transaction-columns";
import { formatBRL } from "@/lib/money/format";
import { TransactionType, LoanKind } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import type { ClientTransaction } from "@/modules/transactions/types";

type HeroTone = "success" | "destructive" | "transfer" | "neutral";

/** Fundo/borda tintados do hero de valor — mesmas opacidades já usadas em painéis coloridos do app (`import-preview.tsx`, `insufficient-balance-alert.tsx`: `/10` de fundo + `/30` de borda), nunca um valor novo. */
const HERO_TONE_CLASSES: Record<HeroTone, string> = {
  success: "bg-success/10 border-success/30",
  destructive: "bg-destructive/10 border-destructive/30",
  transfer: "bg-transfer/16 border-transfer/40",
  neutral: "bg-secondary border-border",
};

/** Mesma classificação de `amountAppearance` (transferência > receita > despesa > resto) — decide só a cor de fundo do hero, a cor do valor em si continua vindo de `amountAppearance`. */
function resolveHeroTone(transaction: ClientTransaction): HeroTone {
  if (transaction.transferId) return "transfer";
  if (transaction.type === TransactionType.INCOME) return "success";
  if (transaction.type === TransactionType.EXPENSE) return "destructive";
  return "neutral";
}

/** Tipo de exibição — perna de transferência mostra badge "Transferência" mesmo persistida como EXPENSE/INCOME (mesma regra de `recent-transactions-table.tsx`). */
function displayType(transaction: ClientTransaction): TransactionType {
  return transaction.transferId ? TransactionType.TRANSFER : transaction.type;
}

/**
 * Rota + rótulo do link "Ver empréstimo/financiamento" — LOAN e FINANCING são
 * o mesmo model `Loan` (docs/50-AUDITORIA-BACKLOG.md, `Loan.kind`), mas cada
 * um tem sua própria tela (`/loans/[id]` vs. `/financings/[id]`). `null`
 * quando a transação não é parcela/desembolso de empréstimo (`loanId` nulo).
 */
function resolveLoanLink(transaction: ClientTransaction): { href: string; label: string } | null {
  if (!transaction.loanId) return null;

  const isFinancing = transaction.loan?.kind === LoanKind.FINANCING;
  return {
    href: isFinancing ? `/financings/${transaction.loanId}` : `/loans/${transaction.loanId}`,
    label: isFinancing ? "Ver financiamento" : "Ver empréstimo",
  };
}

type TransactionDetailHeroProps = {
  transaction: ClientTransaction;
  installmentTotals: Map<string, number>;
};

/**
 * Bloco de destaque do modal de detalhe (docs/06-SCREENS.md, "Transações"):
 * badges (tipo/parcela/transferência/fatura) + valor grande mono + descrição,
 * num fundo tintado pela cor do tipo (`HERO_TONE_CLASSES`).
 */
export function TransactionDetailHero({ transaction, installmentTotals }: TransactionDetailHeroProps) {
  const { className: amountClassName, sign } = amountAppearance(transaction);
  const loanLink = resolveLoanLink(transaction);

  return (
    <div className={cn("rounded-xl border p-4", HERO_TONE_CLASSES[resolveHeroTone(transaction)])}>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
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
            loanKind: transaction.loan?.kind,
          }}
        />
        {loanLink && (
          <Link
            href={loanLink.href}
            className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full border border-border px-1.5 text-[10px] font-extrabold whitespace-nowrap text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
          >
            {loanLink.label}
            <ArrowUpRight className="size-2.5" aria-hidden="true" />
          </Link>
        )}
      </div>

      <p className={cn("font-mono text-[32px] leading-tight font-semibold tracking-tight", amountClassName)}>
        {sign}
        {formatBRL(transaction.amount)}
      </p>
      <p className="mt-1.5 text-sm font-bold text-foreground">{transaction.description}</p>
    </div>
  );
}
