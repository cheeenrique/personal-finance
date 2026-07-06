"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { FormModal } from "@/components/shared/form-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/forms/currency-input";
import { notifySuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CARD_COLOR_OPTIONS, cardSwatchClass } from "./card-color";
import { CARD_ICON_OPTIONS } from "./card-icon";
import { createCardForClient, updateCardForClient } from "./ui-actions";
import type { CardSummaryView } from "./types";

type CardFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criação; cartão existente = edição. */
  card: CardSummaryView | null;
};

type FormState = {
  name: string;
  brand: string;
  limit: string;
  closingDay: string;
  dueDay: string;
  color: string | null;
  icon: string | null;
};

function emptyFormState(): FormState {
  return { name: "", brand: "", limit: "", closingDay: "1", dueDay: "10", color: null, icon: null };
}

function formStateFromCard(card: CardSummaryView): FormState {
  return {
    name: card.name,
    brand: card.brand,
    limit: card.limit,
    closingDay: String(card.closingDay),
    dueDay: String(card.dueDay),
    color: card.color,
    icon: card.icon,
  };
}

/**
 * Criação/edição de cartão (docs/22-CREDIT_CARDS.md, "Criação de Cartão").
 * Mesmo componente pros dois fluxos — `card` presente = edição.
 */
export function CardFormModal({ open, onOpenChange, card }: CardFormModalProps) {
  const isEditing = Boolean(card);
  const [form, setForm] = useState<FormState>(() => (card ? formStateFromCard(card) : emptyFormState()));
  const [formError, setFormError] = useState<string | null>(null);
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
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const input = {
      name: form.name,
      brand: form.brand,
      limit: form.limit,
      closingDay: Number(form.closingDay),
      dueDay: Number(form.dueDay),
      color: form.color,
      icon: form.icon,
    };

    startTransition(async () => {
      const result =
        isEditing && card ? await updateCardForClient(card.id, input) : await createCardForClient(input);

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
      title={isEditing ? "Editar cartão" : "Novo cartão"}
      description="Nome, bandeira, limite e datas de fatura."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-name">Nome</Label>
          <Input
            id="card-name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Ex.: Nubank, XP Visa…"
            autoFocus
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-brand">Bandeira</Label>
          <Input
            id="card-brand"
            value={form.brand}
            onChange={(event) => setForm((prev) => ({ ...prev, brand: event.target.value }))}
            placeholder="Ex.: Visa, Mastercard, Elo…"
            required
            disabled={isPending}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-limit">Limite</Label>
          <CurrencyInput
            id="card-limit"
            value={form.limit}
            onValueChange={(value) => setForm((prev) => ({ ...prev, limit: value }))}
            required
            disabled={isPending}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-closing-day">Dia de fechamento</Label>
            <Input
              id="card-closing-day"
              type="number"
              min={1}
              max={31}
              value={form.closingDay}
              onChange={(event) => setForm((prev) => ({ ...prev, closingDay: event.target.value }))}
              required
              disabled={isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="card-due-day">Dia de vencimento</Label>
            <Input
              id="card-due-day"
              type="number"
              min={1}
              max={31}
              value={form.dueDay}
              onChange={(event) => setForm((prev) => ({ ...prev, dueDay: event.target.value }))}
              required
              disabled={isPending}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {CARD_COLOR_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    color: prev.color === option.value ? null : option.value,
                  }))
                }
                aria-label={option.label}
                aria-pressed={form.color === option.value}
                disabled={isPending}
                className={cn(
                  "size-8 rounded-full ring-offset-2 ring-offset-background transition-all",
                  cardSwatchClass(option.value),
                  form.color === option.value ? "ring-2 ring-foreground" : "opacity-60 hover:opacity-100",
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Ícone</Label>
          <div className="flex flex-wrap gap-2">
            {CARD_ICON_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = form.icon === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      icon: prev.icon === option.value ? null : option.value,
                    }))
                  }
                  aria-label={option.label}
                  aria-pressed={active}
                  disabled={isPending}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-[10px] border transition-colors",
                    active
                      ? "border-primary bg-primary/16 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>

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
      </form>
    </FormModal>
  );
}
