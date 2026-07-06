import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Receipt } from "lucide-react";

import { TransactionType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<
  TransactionType,
  { label: string; icon: typeof ArrowUpRight; className: string }
> = {
  [TransactionType.INCOME]: {
    label: "Receita",
    icon: ArrowUpRight,
    className: "bg-success text-success-foreground",
  },
  [TransactionType.EXPENSE]: {
    label: "Despesa",
    icon: ArrowDownLeft,
    className: "bg-destructive text-destructive-foreground",
  },
  [TransactionType.TRANSFER]: {
    label: "Transferência",
    icon: ArrowLeftRight,
    className: "bg-transfer/16 text-on-transfer",
  },
  [TransactionType.CARD_PAYMENT]: {
    label: "Pagamento de fatura",
    icon: Receipt,
    className: "bg-secondary text-secondary-foreground",
  },
};

/**
 * Badge do tipo de transação (docs/04-DESIGN_SYSTEM.md/handoff, "Badges").
 * Cor nunca é único indicador — sempre acompanhada de ícone + texto.
 */
export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        config.className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {config.label}
    </span>
  );
}

/**
 * Indicador de parcelamento ("4/10") — tom de laranja próprio, dessaturado,
 * para não colidir visualmente com botões `--accent` na mesma tela
 * (docs/04-DESIGN_SYSTEM.md, "Cores Financeiras", nota sobre Parcelamento).
 */
export function InstallmentBadge({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-orange-800/85 px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap text-orange-50"
      aria-label={`Parcela ${current} de ${total}`}
    >
      {current}/{total}
    </span>
  );
}
