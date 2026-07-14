"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, CreditCard, Layers3, Plus, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useShell } from "@/components/providers/shell-provider";
import { TransactionType } from "@/generated/prisma/enums";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";
import { AccountFormModal } from "@/components/accounts/account-form-modal";
import { TransferModal } from "@/components/accounts/transfer-modal";
import { listAccountsForTransferClient } from "@/components/accounts/ui-actions";
import type { AccountCardData } from "@/components/accounts/types";
import { CardFormModal } from "@/components/cards/card-form-modal";
import { InstallmentFormModal } from "@/components/installments/installment-form-modal";

type QuickAction =
  | {
      kind: "transaction";
      label: string;
      icon: LucideIcon;
      type: TransactionType;
      className: string;
      strokeWidth?: number;
    }
  | {
      kind: "transfer" | "card" | "account" | "installment";
      label: string;
      icon: LucideIcon;
      className: string;
      strokeWidth?: number;
    };

/**
 * 6 ações fixas do Dashboard (docs/11-DASHBOARD.md, "Ações Rápidas") —
 * botões "outline + tint" (borda e fundo no mix da cor semântica, texto no
 * tom `on-*`), não preenchidos — visual de referência em
 * `design/Personal Finance App.dc.html` ("quick actions"). Todas as 6 abrem o
 * `FormModal` correspondente direto (docs/06-SCREENS.md: "não duplicar
 * modal") — Receita/Despesa reusam o shell global (`useShell`); Transferência,
 * Cartão, Conta e Parcelamento renderizam seus próprios `FormModal`s aqui,
 * localmente (docs/50-AUDITORIA-BACKLOG.md, F6: eram só navegação pra
 * listagem, 1 clique extra pra sempre chegar no formulário). Cartão/Conta/
 * Parcelamento usam o mesmo tratamento neutro (borda `--pf-border`) do demo —
 * só as 3 ações que movimentam dinheiro (receita/despesa/transferência) levam
 * cor.
 */
const ACTIONS: QuickAction[] = [
  {
    kind: "transaction",
    label: "Nova receita",
    icon: Plus,
    type: TransactionType.INCOME,
    className: "border-success/40 bg-success/12 text-on-success hover:bg-success/20",
    strokeWidth: 2.4,
  },
  {
    kind: "transaction",
    label: "Nova despesa",
    icon: Plus,
    type: TransactionType.EXPENSE,
    className:
      "border-destructive/40 bg-destructive/12 text-on-danger hover:bg-destructive/20",
    strokeWidth: 2.4,
  },
  {
    kind: "transfer",
    label: "Transferência",
    icon: ArrowLeftRight,
    className: "border-transfer/40 bg-transfer/12 text-on-transfer hover:bg-transfer/20",
    strokeWidth: 2.2,
  },
  {
    kind: "card",
    label: "Novo cartão",
    icon: CreditCard,
    className:
      "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
  {
    kind: "account",
    label: "Nova conta",
    icon: Wallet,
    className:
      "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
  {
    kind: "installment",
    label: "Novo parcelamento",
    icon: Layers3,
    className:
      "border-border bg-transparent text-muted-foreground hover:border-muted-foreground",
  },
];

export function QuickActions() {
  const { openTransactionModal } = useShell();
  const [transferOpen, setTransferOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [transferAccounts, setTransferAccounts] = useState<AccountCardData[]>([]);

  // Busca contas (Server Action) só quando o modal de transferência abre —
  // efeito legítimo: sincroniza com sistema externo, mesmo padrão de
  // `PayInvoiceModal`/`InstallmentFormModal` (`setState` só dentro do `.then()`).
  useEffect(() => {
    if (!transferOpen) return;

    listAccountsForTransferClient().then((result) => {
      if (result.success) setTransferAccounts(result.data);
    });
  }, [transferOpen]);

  function handleClick(action: QuickAction) {
    switch (action.kind) {
      case "transaction":
        openTransactionModal(action.type);
        return;
      case "transfer":
        setTransferOpen(true);
        return;
      case "card":
        setCardOpen(true);
        return;
      case "account":
        setAccountOpen(true);
        return;
      case "installment":
        setInstallmentOpen(true);
        return;
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-[10px]">
        {ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleClick(action)}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-[7px] rounded-[10px] border px-3.5 text-[13px] font-bold whitespace-nowrap transition-colors duration-100 ease-pf-out sm:h-9 sm:justify-start",
              action.className,
              FOCUS_RING_CLASS,
            )}
          >
            <action.icon
              className="size-[15px]"
              strokeWidth={action.strokeWidth ?? 2}
              aria-hidden="true"
            />
            {action.label}
          </button>
        ))}
      </div>

      <TransferModal
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={transferAccounts}
      />
      <CardFormModal open={cardOpen} onOpenChange={setCardOpen} card={null} />
      <AccountFormModal open={accountOpen} onOpenChange={setAccountOpen} account={null} />
      <InstallmentFormModal open={installmentOpen} onOpenChange={setInstallmentOpen} />
    </>
  );
}
