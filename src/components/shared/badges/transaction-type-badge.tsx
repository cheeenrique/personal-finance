import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Receipt } from "lucide-react";

import { TransactionType, LoanKind } from "@/generated/prisma/enums";
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

type TransactionInlineBadgesRow = {
  type: TransactionType;
  transferId: string | null;
  isPaid: boolean;
  installmentNumber: number | null;
  installmentsCount: number | null;
  /** Não-nulo ⇒ transação linkada a um empréstimo (parcela OU desembolso, ver `modules/loans`) — opcional pra não quebrar consumidores que ainda não carregam esse campo (ex.: preview do Dashboard). */
  loanId?: string | null;
  /** `Loan.kind` do empréstimo linkado — decide o texto da badge (LOAN ⇒ "Empréstimo", FINANCING ⇒ "Financiamento"). Opcional pelo mesmo motivo de `loanId`; `undefined`/`null` cai no default "Empréstimo". */
  loanKind?: LoanKind | null;
};

/**
 * Pills inline ao lado da descrição — parcela, transferência, fatura e
 * pendência — no lugar de uma coluna "Tipo" própria (design/Personal Finance
 * App.dc.html, "últimas transações"/"Transações": só há Data, Descrição,
 * Categoria, Conta/Cartão, Valor e Ações). Usado tanto no preview do
 * Dashboard quanto na tabela completa de `/transactions`, pra não duplicar
 * essa lógica visual em dois lugares.
 */
export function TransactionInlineBadges({ row }: { row: TransactionInlineBadgesRow }) {
  return (
    <>
      {row.installmentNumber && row.installmentsCount && (
        // Laranja dessaturado próprio (`--installment`), não `--accent`: evita
        // colidir com CTAs de ação na mesma tela (docs/04-DESIGN_SYSTEM.md,
        // "Cores Financeiras" > "Parcelamento"; docs/50-AUDITORIA-BACKLOG.md, D6).
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-installment px-1.5 font-mono text-[10px] font-semibold whitespace-nowrap text-installment-foreground">
          {row.installmentNumber}/{row.installmentsCount}
        </span>
      )}
      {row.transferId && (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-transfer/16 px-1.5 text-[10px] font-extrabold whitespace-nowrap text-on-transfer">
          Transfer
        </span>
      )}
      {!row.transferId && row.type === TransactionType.CARD_PAYMENT && (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-secondary px-1.5 text-[10px] font-extrabold whitespace-nowrap text-secondary-foreground">
          Fatura
        </span>
      )}
      {row.loanId && (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-primary/16 px-1.5 text-[10px] font-extrabold whitespace-nowrap text-on-primary">
          {row.loanKind === LoanKind.FINANCING ? "Financiamento" : "Empréstimo"}
        </span>
      )}
      {!row.isPaid && (
        <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-warning/16 px-1.5 text-[10px] font-extrabold whitespace-nowrap text-on-warning">
          Pendente
        </span>
      )}
    </>
  );
}
