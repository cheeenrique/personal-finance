import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { formatBRL } from "@/lib/money/format";
import { cn, CARD_SHADOW_CLASS } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS, DEFAULT_ACCOUNT_COLOR } from "./account-config";
import { AccountIcon } from "./account-icon";
import type { AccountCardData } from "./types";

type AccountCardProps = {
  account: AccountCardData;
  onEdit: () => void;
  onDelete: () => void;
};

/**
 * Card de conta (docs/21-ACCOUNTS.md, "Exemplo de Card" + handoff "Contas").
 * Ações (editar/excluir) ficam fora do `<Link>` de detalhe — evita aninhar
 * elemento interativo dentro de outro (`<button>` dentro de `<a>` é inválido).
 */
export function AccountCard({ account, onEdit, onDelete }: AccountCardProps) {
  const color = account.color ?? DEFAULT_ACCOUNT_COLOR;
  const balance = Number(account.balance);
  const balanceTone = balance < 0 ? "text-destructive" : "text-success";

  return (
    <div
      className={cn(
        "relative flex min-h-[160px] flex-col rounded-2xl border border-border bg-card",
        CARD_SHADOW_CLASS,
      )}
    >
      <div className="absolute top-3 right-3 z-10 flex gap-1.5">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onEdit();
          }}
          aria-label={`Editar ${account.name}`}
          className="flex size-7 items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            onDelete();
          }}
          aria-label={`Excluir ${account.name}`}
          className="flex size-7 items-center justify-center rounded-[7px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <Link
        href={`/accounts/${account.id}`}
        className="flex flex-1 flex-col gap-4 rounded-2xl p-5 pr-16 outline-none focus-visible:ring-3 focus-visible:ring-primary/28"
      >
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[11px]"
            style={{ backgroundColor: `${color}29`, color }}
          >
            <AccountIcon icon={account.icon} type={account.type} className="size-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-foreground">{account.name}</p>
            <p className="truncate text-[12.5px] font-semibold text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </p>
          </div>
        </div>

        <div className="mt-auto">
          <p className={cn("font-mono text-2xl font-semibold", balanceTone)}>
            {formatBRL(account.balance)}
          </p>
          <p className="mt-1 text-[12px] font-medium text-muted-foreground">
            Saldo inicial: {formatBRL(account.initialBalance)}
          </p>
        </div>
      </Link>
    </div>
  );
}

/** Tile "+ Nova Conta" — mesmo padrão de `NewCardTile`/`NewInstallmentTile` (ícone size-10/size-5, rounded-xl). */
export function NewAccountTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-accent hover:text-accent"
    >
      <span className="flex size-10 items-center justify-center rounded-[11px] bg-accent/16">
        <Plus className="size-5 text-accent" aria-hidden="true" />
      </span>
      <span className="text-sm font-bold">Nova Conta</span>
    </button>
  );
}
