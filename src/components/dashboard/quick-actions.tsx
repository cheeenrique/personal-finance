"use client";

import { useRouter } from "next/navigation";
import { ArrowLeftRight, CreditCard, Layers3, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useShell } from "@/components/providers/shell-provider";
import { TransactionType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

type QuickAction =
  | { kind: "modal"; label: string; icon: LucideIcon; type: TransactionType; className: string }
  | { kind: "link"; label: string; icon: LucideIcon; href: string; className: string };

/**
 * 6 ações fixas do Dashboard (docs/11-DASHBOARD.md, "Ações Rápidas";
 * design/PERSONAL_FINANCE_LAYOUT_HANDOFF.md, "Dashboard"). Receita/Despesa
 * abrem o mesmo modal de nova transação usado em qualquer ponto do sistema
 * (`useShell`, docs/06-SCREENS.md: "não duplicar modal"); Transferência,
 * Cartão, Conta e Parcelamento navegam pra tela dedicada — fluxos próprios
 * (`modules/accounts/transfer.ts`, `modules/cards`, `modules/transactions/installments.ts`)
 * ainda sem modal no shell global.
 */
const ACTIONS: QuickAction[] = [
  {
    kind: "modal",
    label: "Nova receita",
    icon: TrendingUp,
    type: TransactionType.INCOME,
    className: "bg-success text-success-foreground hover:bg-success/90",
  },
  {
    kind: "modal",
    label: "Nova despesa",
    icon: TrendingDown,
    type: TransactionType.EXPENSE,
    className: "bg-destructive text-white hover:bg-destructive/90",
  },
  {
    kind: "link",
    label: "Transferência",
    icon: ArrowLeftRight,
    href: "/accounts",
    className: "bg-transfer text-white hover:bg-transfer/90",
  },
  {
    kind: "link",
    label: "Novo cartão",
    icon: CreditCard,
    href: "/cards",
    className: "bg-accent text-accent-foreground hover:bg-accent/90",
  },
  {
    kind: "link",
    label: "Nova conta",
    icon: Wallet,
    href: "/accounts",
    className: "bg-accent text-accent-foreground hover:bg-accent/90",
  },
  {
    kind: "link",
    label: "Novo parcelamento",
    icon: Layers3,
    href: "/installments",
    className: "bg-accent text-accent-foreground hover:bg-accent/90",
  },
];

export function QuickActions() {
  const router = useRouter();
  const { openTransactionModal } = useShell();

  return (
    <div className="flex flex-wrap gap-2.5">
      {ACTIONS.map((action) => (
        <Button
          key={action.label}
          type="button"
          size="lg"
          onClick={() =>
            action.kind === "modal" ? openTransactionModal(action.type) : router.push(action.href)
          }
          className={cn(action.className)}
        >
          <action.icon className="size-4" aria-hidden="true" />
          {action.label}
        </Button>
      ))}
    </div>
  );
}
