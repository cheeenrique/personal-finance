"use client";

import { useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import { Ban, CheckCircle2, Lock } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { cn } from "@/lib/utils";
import { notifyError, notifySuccess } from "@/lib/toast";
import { setCardStatusAction } from "@/modules/cards/actions";
import { CardStatus } from "@/generated/prisma/enums";

type CardStatusControlProps = {
  cardId: string;
  cardName: string;
  status: CardStatus;
  /** Chamado após troca bem-sucedida — caller decide o que refrescar (mesmo padrão de `router.refresh()` explícito de `card-detail-view.tsx`/`loan-detail-view.tsx`). */
  onChanged: (status: CardStatus) => void;
  disabled?: boolean;
};

const STATUS_OPTIONS: { value: CardStatus; label: string; icon: LucideIcon }[] = [
  { value: CardStatus.ACTIVE, label: "Ativo", icon: CheckCircle2 },
  { value: CardStatus.BLOCKED, label: "Bloqueado", icon: Lock },
  { value: CardStatus.CANCELLED, label: "Cancelado", icon: Ban },
];

/**
 * Único controle de status (ACTIVE/BLOCKED/CANCELLED) do cartão em edição —
 * tabs segmentadas de 3, mesmo padrão do seletor de tipo em
 * `CardFormFields` (`aria-pressed` + tint `primary` no ativo). Ativo/Bloqueado
 * aplicam direto via `setCardStatusAction`; Cancelado passa por
 * `ConfirmDialog` antes — é a única transição tratada como destrutiva (dono:
 * cartão cancelado some das ações do dia a dia). Só aparece em
 * `CardFormModal` quando editando um cartão existente (nunca na criação).
 */
export function CardStatusControl({ cardId, cardName, status, onChanged, disabled }: CardStatusControlProps) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function applyDirect(next: CardStatus) {
    startTransition(async () => {
      const result = await setCardStatusAction(cardId, next);
      if (!result.success) {
        notifyError(result.error.message);
        return;
      }
      notifySuccess(next === CardStatus.ACTIVE ? "Cartão ativado" : "Cartão bloqueado");
      onChanged(next);
    });
  }

  async function handleConfirmCancel() {
    const result = await setCardStatusAction(cardId, CardStatus.CANCELLED);
    if (!result.success) throw new Error(result.error.message);
    notifySuccess("Cartão cancelado");
    onChanged(CardStatus.CANCELLED);
  }

  function handleSelect(next: CardStatus) {
    if (next === status) return;
    if (next === CardStatus.CANCELLED) {
      setConfirmOpen(true);
      return;
    }
    applyDirect(next);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-foreground">Status do cartão</span>
      <div className="grid grid-cols-3 gap-2">
        {STATUS_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              aria-pressed={isActive}
              disabled={disabled || isPending}
              className={cn(
                "flex h-10 items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                isActive ? "border-primary bg-primary/16 text-primary" : "border-border text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Cancelar ${cardName}?`}
        description="Cartão cancelado deixa de aparecer nas ações do dia a dia (Telegram, nova compra). O histórico continua intacto, mas essa troca é tratada como definitiva."
        confirmLabel="Cancelar cartão"
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
