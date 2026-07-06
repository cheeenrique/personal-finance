import { TrendingDown, TrendingUp } from "lucide-react";

import { CategoryType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { CATEGORY_TYPE_LABELS } from "./category-config";

const TYPE_CONFIG: Record<CategoryType, { icon: typeof TrendingUp; className: string }> = {
  [CategoryType.INCOME]: { icon: TrendingUp, className: "bg-success text-success-foreground" },
  [CategoryType.EXPENSE]: { icon: TrendingDown, className: "bg-destructive text-destructive-foreground" },
};

/**
 * Badge de tipo da categoria (INCOME/EXPENSE) — mesmo padrão visual de
 * `components/shared/badges/transaction-type-badge.tsx`, mas para
 * `CategoryType` (enum próprio, sem TRANSFER/CARD_PAYMENT). Cor nunca é
 * único indicador — sempre acompanhada de ícone + texto.
 */
export function CategoryTypeBadge({ type, className }: { type: CategoryType; className?: string }) {
  const config = TYPE_CONFIG[type];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap",
        config.className,
        className,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {CATEGORY_TYPE_LABELS[type]}
    </span>
  );
}
