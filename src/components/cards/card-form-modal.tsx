"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { useFieldErrors } from "@/components/forms/use-field-errors";
import { isBlank } from "@/components/forms/validation";
import { useIsDesktop } from "@/hooks/use-media-query";
import { notifySuccess } from "@/lib/toast";
import { CardType } from "@/generated/prisma/enums";
import { cardGradient } from "./card-color";
import { CardFace } from "./card-face";
import { CardFormFields } from "./card-form-fields";
import { createCardForClient, updateCardForClient } from "./ui-actions";
import type { CardSummaryView } from "./types";

type CardFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação; cartão existente = edição. */
  card: CardSummaryView | null;
};

export type CardFormState = {
  name: string;
  brand: string;
  type: CardType;
  limit: string;
  closingDay: string;
  dueDay: string;
  color: string | null;
  /** Só os 4 últimos dígitos, nunca o número completo (`lastFourSchema` filtra/valida no backend). */
  lastFour: string;
  holderName: string;
};

function emptyFormState(): CardFormState {
  return {
    name: "",
    brand: "",
    type: CardType.CREDIT,
    limit: "",
    closingDay: "1",
    dueDay: "10",
    color: null,
    lastFour: "",
    holderName: "",
  };
}

function formStateFromCard(card: CardSummaryView): CardFormState {
  return {
    name: card.name,
    brand: card.brand,
    type: card.type,
    limit: card.limit,
    closingDay: String(card.closingDay),
    dueDay: String(card.dueDay),
    color: card.color,
    lastFour: card.lastFour ?? "",
    holderName: card.holderName ?? "",
  };
}

/**
 * Criação/edição de cartão (docs/22-CREDIT_CARDS.md, "Criação de Cartão").
 * Mesmo componente pros dois fluxos — `card` presente = edição. Preview ao
 * vivo (`CardFace`) ligado direto no `useState` do form: cada tecla já é o
 * próximo render, sem debounce nem estado espelhado (fonte visual:
 * `Personal Finance - Cartoes.dc.html`, seção MODAL). Campos extraídos em
 * `CardFormFields` — este arquivo só orquestra estado/validação/submit.
 */
export function CardFormModal({ open, onOpenChange, card }: CardFormModalProps) {
  const isEditing = Boolean(card);
  const isDesktop = useIsDesktop();
  const [form, setForm] = useState<CardFormState>(() => (card ? formStateFromCard(card) : emptyFormState()));
  const [formError, setFormError] = useState<string | null>(null);
  const { fieldErrors, setFieldErrors, clearFieldError } = useFieldErrors();
  const [isPending, startTransition] = useTransition();

  /**
   * Reset ao abrir (criar ou trocar de cartão editado) — "adjusting state
   * when a prop changes" feito durante o render, não em `useEffect`, mesmo
   * padrão de `NewTransactionForm`.
   */
  const syncKey = open ? (card?.id ?? "__new__") : null;
  const [lastSyncKey, setLastSyncKey] = useState<string | null>(syncKey);
  if (syncKey !== lastSyncKey) {
    setLastSyncKey(syncKey);
    if (syncKey) {
      setForm(card ? formStateFromCard(card) : emptyFormState());
      setFormError(null);
      setFieldErrors({});
    }
  }

  // MEAL não tem fatura/ciclo/limite (`modules/cards/schemas.ts`: os 3 campos
  // viram placeholder ignorado pelo domínio para esse tipo) — os campos nem
  // aparecem no form nem são validados/enviados.
  const isMeal = form.type === CardType.MEAL;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const errors: Record<string, string> = {};
    if (isBlank(form.name)) errors.name = "Nome é obrigatório.";
    if (isBlank(form.brand)) errors.brand = "Bandeira é obrigatória.";
    if (form.lastFour && form.lastFour.length !== 4) {
      errors.lastFour = "Informe os 4 dígitos ou deixe em branco.";
    }
    if (!isMeal) {
      if (isBlank(form.limit)) errors.limit = "Informe um valor.";
      if (isBlank(form.closingDay)) errors.closingDay = "Dia de fechamento é obrigatório.";
      if (isBlank(form.dueDay)) errors.dueDay = "Dia de vencimento é obrigatório.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    // `type` é imutável (ver `updateCardSchema`) — só entra no input de criação.
    const baseInput = {
      name: form.name,
      brand: form.brand,
      color: form.color,
      lastFour: form.lastFour,
      holderName: form.holderName,
      ...(isMeal
        ? {}
        : { limit: form.limit, closingDay: Number(form.closingDay), dueDay: Number(form.dueDay) }),
    };

    startTransition(async () => {
      const result =
        isEditing && card
          ? await updateCardForClient(card.id, baseInput)
          : await createCardForClient({ ...baseInput, type: form.type });

      if (!result.success) {
        setFormError(result.error.message);
        return;
      }

      notifySuccess(isEditing ? "Cartão atualizado" : "Cartão criado");
      onOpenChange(false);
    });
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      size="wide"
      title={isEditing ? "Editar cartão" : "Novo cartão"}
      description={
        isEditing
          ? "Nome, bandeira e demais dados do cartão."
          : "Tipo, nome, bandeira e demais dados do cartão."
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6 xl:flex-row xl:items-start">
        {/* preview ao vivo — sempre no topo no mobile, à esquerda no desktop (mesmo breakpoint que troca Sheet↔Dialog em FormModal, ver useIsDesktop) */}
        <div className="mx-auto w-full max-w-[240px] xl:sticky xl:top-0 xl:mx-0 xl:w-[210px] xl:shrink-0">
          <CardFace
            gradient={cardGradient(form.color)}
            cardName={form.name}
            brand={form.brand}
            lastFour={form.lastFour || null}
            holder={form.holderName || null}
            type={form.type}
          />
          <p className="mt-3 text-center text-[11px] font-medium text-muted-foreground xl:text-left">
            Pré-visualização ao vivo — atualiza conforme você edita.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <CardFormFields
            form={form}
            setForm={setForm}
            isEditing={isEditing}
            isPending={isPending}
            isDesktop={isDesktop}
            fieldErrors={fieldErrors}
            clearFieldError={clearFieldError}
          />

          {formError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {formError}
            </p>
          )}

          <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </div>
        </div>
      </form>
    </FormModal>
  );
}
