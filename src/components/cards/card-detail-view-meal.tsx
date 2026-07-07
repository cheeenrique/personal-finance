"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil, PiggyBank, Plus, Receipt, Trash2, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { deleteCardAction } from "@/modules/cards/actions";
import { TransactionType } from "@/generated/prisma/enums";
import { useShell } from "@/components/providers/shell-provider";
import { cardTintClass } from "./card-color";
import { CARD_ICON_MAP, DEFAULT_CARD_ICON } from "./card-icon";
import { CardFormModal } from "./card-form-modal";
import { CardTransactionsTable } from "./card-transactions-table";
import type { CardSummaryView } from "./types";

type CardDetailViewMealProps = { card: CardSummaryView };

/**
 * Detalhe de cartão ALIMENTAÇÃO (vale-refeição/saldo pré-pago) — sem
 * fatura/ciclo/limite (docs/22-CREDIT_CARDS.md não cobre este tipo, ver
 * `modules/cards/service.ts` `assertCreditCard`/`mealBalance`). Componente
 * separado de `CardDetailView` (CREDIT) em vez de um branch interno: a
 * composição diverge o bastante (sem KPIs de limite/fatura, sem histórico de
 * faturas, com "+ Recarga" no lugar) pra justificar, e mantém o fluxo CREDIT
 * 100% intocado — `page.tsx` decide qual dos dois renderizar antes de buscar
 * qualquer coisa de fatura (que lançaria `CardTypeNotSupportedError` pra MEAL).
 */
export function CardDetailViewMeal({ card }: CardDetailViewMealProps) {
  const router = useRouter();
  const { openTransactionModal } = useShell();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const Icon = (card.icon && CARD_ICON_MAP[card.icon]) || DEFAULT_CARD_ICON;

  async function handleDelete() {
    const result = await deleteCardAction(card.id);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Cartão excluído");
    router.push("/cards");
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/cards"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Cartões
      </Link>

      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-[12px]",
              cardTintClass(card.color),
            )}
          >
            <Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-extrabold text-foreground">{card.name}</h2>
              <span className="shrink-0 rounded-full bg-success/16 px-2 py-0.5 text-[11px] font-bold text-on-success">
                Alimentação
              </span>
            </div>
            <p className="truncate text-sm font-medium text-muted-foreground">{card.brand}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            aria-label={`Editar ${card.name}`}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            aria-label={`Excluir ${card.name}`}
            className="flex size-9 items-center justify-center rounded-[10px] border border-border text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KPICard icon={Wallet} title="Recarregado" value={formatBRL(card.mealRecharged ?? "0")} />
        <KPICard icon={Receipt} title="Gasto" value={formatBRL(card.mealSpent ?? "0")} />
        <KPICard
          icon={PiggyBank}
          title="Saldo disponível"
          value={formatBRL(card.mealBalance ?? "0")}
          tone="success"
        />
      </div>

      <Button
        type="button"
        variant="accent"
        className="w-full gap-1.5 sm:w-fit"
        onClick={() => openTransactionModal(TransactionType.INCOME, card.id)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Recarga
      </Button>

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-extrabold text-foreground">Movimentações</h3>
        <CardTransactionsTable cardId={card.id} />
      </div>

      <CardFormModal open={editOpen} onOpenChange={setEditOpen} card={card} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Excluir ${card.name}?`}
        description="Essa ação não pode ser desfeita. As transações já lançadas neste cartão continuam existindo, mas ele some da listagem."
        onConfirm={handleDelete}
      />
    </div>
  );
}
