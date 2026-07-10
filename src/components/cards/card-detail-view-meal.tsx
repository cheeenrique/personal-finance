"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, PiggyBank, Plus, Receipt, Wallet } from "lucide-react";

import { KPICard } from "@/components/shared/kpi-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/money/format";
import { notifySuccess } from "@/lib/toast";
import { deleteCardAction } from "@/modules/cards/actions";
import { TransactionType } from "@/generated/prisma/enums";
import { useShell } from "@/components/providers/shell-provider";
import { CardDetailFacePanel } from "./card-detail-face-panel";
import { CardFormModal } from "./card-form-modal";
import { CardTransactionsTable } from "./card-transactions-table";
import { CardPeriodFilterBar } from "./card-period-filter-bar";
import { useCardPeriodFilter } from "./use-card-period-filter";
import type { CardSummaryView } from "./types";

type CardDetailViewMealProps = { card: CardSummaryView };

/**
 * Detalhe de cartão ALIMENTAÇÃO (vale-refeição/saldo pré-pago) — sem
 * fatura/ciclo/limite (docs/22-CREDIT_CARDS.md não cobre este tipo, ver
 * `modules/cards/service.ts` `assertCreditCard`/`mealBalance`). Mesmo hero de
 * `CardDetailView` (CREDIT) — face grande + Editar/Excluir
 * (`CardDetailFacePanel`, que já resolve o selo "Alimentação" via
 * `CardFace`) — mas KPIs/seções divergem o bastante (Recarregado/Gasto/Saldo
 * em vez de Limite/Fatura, sem histórico de faturas, "+ Recarga" no lugar de
 * "+ Compra") pra justificar componente separado em vez de um branch
 * interno. `page.tsx` decide qual dos dois renderizar antes de buscar
 * qualquer coisa de fatura (que lançaria `CardTypeNotSupportedError` pra
 * MEAL).
 */
export function CardDetailViewMeal({ card }: CardDetailViewMealProps) {
  const router = useRouter();
  const { openTransactionModal } = useShell();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const periodFilter = useCardPeriodFilter();

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <CardDetailFacePanel card={card} onEdit={() => setEditOpen(true)} onDelete={() => setDeleteOpen(true)} />

        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-foreground sm:text-2xl">{card.name}</h2>
            <p className="mt-1 text-sm font-semibold text-muted-foreground">
              {card.brand} · final {card.lastFour ?? "----"}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard icon={Wallet} title="Recarregado" value={formatBRL(card.mealRecharged ?? "0")} tone="neutral" />
            <KPICard icon={Receipt} title="Gasto" value={formatBRL(card.mealSpent ?? "0")} tone="warning" />
            <KPICard icon={PiggyBank} title="Saldo" value={formatBRL(card.mealBalance ?? "0")} tone="success" />
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
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-extrabold text-foreground">Movimentações</h3>

        <CardPeriodFilterBar
          mode={periodFilter.mode}
          setMode={periodFilter.setMode}
          customFrom={periodFilter.customFrom}
          setCustomFrom={periodFilter.setCustomFrom}
          customTo={periodFilter.customTo}
          setCustomTo={periodFilter.setCustomTo}
          idPrefix="card-meal-period"
        />

        <CardTransactionsTable cardId={card.id} dateFrom={periodFilter.range.dateFrom} dateTo={periodFilter.range.dateTo} />
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
