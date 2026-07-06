"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight, CreditCard, Layers3, Plus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useShell } from "@/components/providers/shell-provider";
import { TransactionType } from "@/generated/prisma/enums";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

type QuickAction =
  | { kind: "modal"; label: string; icon: LucideIcon; type: TransactionType; className: string; strokeWidth?: number }
  | { kind: "link"; label: string; icon: LucideIcon; href: string; className: string; strokeWidth?: number };

/**
 * 6 ações fixas do Dashboard (docs/11-DASHBOARD.md, "Ações Rápidas") —
 * botões "outline + tint" (borda e fundo no mix da cor semântica, texto no
 * tom `on-*`), não preenchidos — visual de referência em
 * `design/Personal Finance App.dc.html` ("quick actions"). Receita/Despesa
 * abrem o mesmo modal de nova transação usado em qualquer ponto do sistema
 * (`useShell`, docs/06-SCREENS.md: "não duplicar modal"); Transferência,
 * Cartão, Conta e Parcelamento navegam pra tela dedicada — fluxos próprios
 * ainda sem modal no shell global. Cartão/Conta/Parcelamento usam o mesmo
 * tratamento neutro (borda `--pf-border`) do demo — só as 3 ações que
 * movimentam dinheiro (receita/despesa/transferência) levam cor.
 */
const ACTIONS: QuickAction[] = [
  {
    kind: "modal",
    label: "Nova receita",
    icon: Plus,
    type: TransactionType.INCOME,
    className: "border-success/40 bg-success/12 text-on-success hover:bg-success/20",
    strokeWidth: 2.4,
  },
  {
    kind: "modal",
    label: "Nova despesa",
    icon: Plus,
    type: TransactionType.EXPENSE,
    className: "border-destructive/40 bg-destructive/12 text-on-danger hover:bg-destructive/20",
    strokeWidth: 2.4,
  },
  {
    kind: "link",
    label: "Transferência",
    icon: ArrowLeftRight,
    href: "/accounts",
    className: "border-transfer/40 bg-transfer/12 text-on-transfer hover:bg-transfer/20",
    strokeWidth: 2.2,
  },
  {
    kind: "link",
    label: "Novo cartão",
    icon: CreditCard,
    href: "/cards",
    className: "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
  {
    kind: "link",
    label: "Nova conta",
    icon: Wallet,
    href: "/accounts",
    className: "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
  {
    kind: "link",
    label: "Novo parcelamento",
    icon: Layers3,
    href: "/installments",
    className: "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
];

export function QuickActions() {
  const router = useRouter();
  const { openTransactionModal } = useShell();

  return (
    <div className="flex flex-wrap gap-[10px]">
      {ACTIONS.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() =>
            action.kind === "modal" ? openTransactionModal(action.type) : router.push(action.href)
          }
          className={cn(
            "inline-flex h-9 items-center gap-[7px] rounded-[10px] border px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-100 ease-pf-out",
            action.className,
            FOCUS_RING_CLASS,
          )}
        >
          <action.icon className="size-[15px]" strokeWidth={action.strokeWidth ?? 2} aria-hidden="true" />
          {action.label}
        </button>
      ))}
    </div>
  );
}
