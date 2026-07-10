import { CalendarDays } from "lucide-react";

import type { EntitySelectOption } from "@/components/forms/entity-select";
import { TransactionType } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS } from "./period-presets";
import type { IsPaidFilter } from "./use-transaction-filters";

export const ALL_VALUE = "__ALL__";

/** Dot de cor por tipo — espelha `amountAppearance`/`TransactionTypeBadge` (success/danger/on-transfer/primary), usado no select "Tipo" da Faixa 2 do card de filtros. */
const TYPE_DOT_CLASS: Record<string, string> = {
  [ALL_VALUE]: "bg-muted-foreground",
  [TransactionType.INCOME]: "bg-on-success",
  [TransactionType.EXPENSE]: "bg-on-danger",
  TRANSFER: "bg-on-transfer",
  [TransactionType.CARD_PAYMENT]: "bg-on-primary",
};

function TypeDot({ value }: { value: string }) {
  return (
    <span
      className={cn("size-2 shrink-0 rounded-full", TYPE_DOT_CLASS[value] ?? "bg-muted-foreground")}
      aria-hidden="true"
    />
  );
}

export const TYPE_OPTIONS: EntitySelectOption[] = [
  { value: ALL_VALUE, label: "Todos os tipos", icon: <TypeDot value={ALL_VALUE} /> },
  { value: TransactionType.INCOME, label: "Receita", icon: <TypeDot value={TransactionType.INCOME} /> },
  { value: TransactionType.EXPENSE, label: "Despesa", icon: <TypeDot value={TransactionType.EXPENSE} /> },
  { value: "TRANSFER", label: "Transferência", icon: <TypeDot value="TRANSFER" /> },
  {
    value: TransactionType.CARD_PAYMENT,
    label: "Pagamento de fatura",
    icon: <TypeDot value={TransactionType.CARD_PAYMENT} />,
  },
];

const PERIOD_ICON = <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />;

/** Mesmas opções de `PERIOD_OPTIONS` + ícone de calendário fixo (docs handoff "Transações" — select "Período" sempre mostra o ícone, selecionado ou não). */
export const PERIOD_SELECT_OPTIONS: EntitySelectOption[] = PERIOD_OPTIONS.map((option) => ({
  ...option,
  icon: PERIOD_ICON,
}));

export const IS_PAID_OPTIONS: { value: IsPaidFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pago" },
  { value: "pending", label: "Pendente" },
];
