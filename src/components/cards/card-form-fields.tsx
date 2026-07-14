"use client";

import type { Dispatch, SetStateAction } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/forms/currency-input";
import { FormField } from "@/components/forms/form-field";
import { cn } from "@/lib/utils";
import { CardType } from "@/generated/prisma/enums";
import { CARD_COLOR_OPTIONS, cardGradient } from "./card-color";
import type { CardFormState } from "./card-form-modal";

/** `type` é imutável após a criação (`modules/cards/schemas.ts` `updateCardSchema` não aceita o campo) — só aparece como seletor no fluxo de criação. */
const CARD_TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: CardType.CREDIT, label: "Crédito" },
  { value: CardType.MEAL, label: "Alimentação" },
];

/** Atalhos de bandeira do form — mesmo texto que `BrandMark` (`brand-mark.tsx`) sabe detectar. */
const BRAND_SHORTCUTS = ["Visa", "Mastercard", "Elo", "Amex", "Hipercard", "Diners", "Discover"];

/**
 * Máscara leve de validade (MM/AA): aceita só dígitos e barra digitados,
 * reconstrói a partir dos dígitos pra sempre chegar em "MM/AA" (funciona
 * tanto digitando quanto colando "1228"). `expirySchema` (`modules/cards/schemas.ts`)
 * valida o formato final no backend — esta máscara só melhora a digitação.
 */
function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

type CardFormFieldsProps = {
  form: CardFormState;
  setForm: Dispatch<SetStateAction<CardFormState>>;
  isEditing: boolean;
  isPending: boolean;
  isDesktop: boolean;
  fieldErrors: Record<string, string>;
  clearFieldError: (field: string) => void;
};

/**
 * Coluna de campos do `CardFormModal` — extraída pra manter os dois
 * arquivos dentro do guia de ≤300 linhas (docs `05-naming-size.md`). Só
 * layout/inputs; validação e submit continuam no componente pai (só ele
 * conhece `formError`/`onOpenChange`/o fluxo de `startTransition`).
 */
export function CardFormFields({
  form,
  setForm,
  isEditing,
  isPending,
  isDesktop,
  fieldErrors,
  clearFieldError,
}: CardFormFieldsProps) {
  const isMeal = form.type === CardType.MEAL;

  return (
    <>
      {/* `type` é imutável após a criação (`updateCardSchema` não aceita o campo) — seletor só aparece criando um cartão novo. */}
      {!isEditing && (
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <div className="grid grid-cols-2 gap-2">
            {CARD_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, type: option.value }))}
                aria-pressed={form.type === option.value}
                disabled={isPending}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-[10px] border text-sm font-bold transition-colors",
                  form.type === option.value
                    ? "border-primary bg-primary/16 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <FormField label="Nome do cartão" htmlFor="card-name" required error={fieldErrors.name}>
        <Input
          id="card-name"
          value={form.name}
          onChange={(event) => {
            setForm((prev) => ({ ...prev, name: event.target.value }));
            clearFieldError("name");
          }}
          placeholder="Ex.: Nubank, XP Visa…"
          aria-invalid={Boolean(fieldErrors.name)}
          autoFocus={isDesktop}
          disabled={isPending}
        />
      </FormField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px]">
        <div className="flex flex-col gap-1.5">
          <FormField label="Bandeira" htmlFor="card-brand" required error={fieldErrors.brand}>
            <Input
              id="card-brand"
              value={form.brand}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, brand: event.target.value }));
                clearFieldError("brand");
              }}
              placeholder="Visa, Mastercard, Elo…"
              aria-invalid={Boolean(fieldErrors.brand)}
              disabled={isPending}
            />
          </FormField>
          <div className="flex flex-wrap gap-1.5">
            {BRAND_SHORTCUTS.map((shortcut) => (
              <button
                key={shortcut}
                type="button"
                onClick={() => {
                  setForm((prev) => ({ ...prev, brand: shortcut }));
                  clearFieldError("brand");
                }}
                disabled={isPending}
                className="h-7 rounded-full border border-border bg-secondary px-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {shortcut}
              </button>
            ))}
          </div>
        </div>

        <FormField label="Últimos 4 dígitos" htmlFor="card-last-four" error={fieldErrors.lastFour}>
          <Input
            id="card-last-four"
            value={form.lastFour}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, lastFour: event.target.value.replace(/\D/g, "").slice(0, 4) }));
              clearFieldError("lastFour");
            }}
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            aria-invalid={Boolean(fieldErrors.lastFour)}
            disabled={isPending}
            className="font-mono tracking-[0.15em]"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_110px]">
        <FormField label="Nome impresso (titular)" htmlFor="card-holder-name">
          <Input
            id="card-holder-name"
            value={form.holderName}
            onChange={(event) => setForm((prev) => ({ ...prev, holderName: event.target.value }))}
            placeholder="ANA SILVA"
            disabled={isPending}
          />
        </FormField>

        <FormField label="Validade (MM/AA)" htmlFor="card-expiry" error={fieldErrors.expiry}>
          <Input
            id="card-expiry"
            value={form.expiry}
            onChange={(event) => {
              setForm((prev) => ({ ...prev, expiry: formatExpiryInput(event.target.value) }));
              clearFieldError("expiry");
            }}
            inputMode="numeric"
            maxLength={5}
            placeholder="MM/AA"
            aria-invalid={Boolean(fieldErrors.expiry)}
            disabled={isPending}
            className="font-mono tracking-[0.1em]"
          />
        </FormField>
      </div>

      {/* Limite/fechamento/vencimento não existem pra MEAL — saldo pré-pago, sem fatura/ciclo (`modules/cards/service.ts` `assertCreditCard`). */}
      {!isMeal && (
        <>
          <FormField label="Limite" htmlFor="card-limit" required error={fieldErrors.limit}>
            <CurrencyInput
              id="card-limit"
              value={form.limit}
              onValueChange={(value) => {
                setForm((prev) => ({ ...prev, limit: value }));
                clearFieldError("limit");
              }}
              aria-invalid={Boolean(fieldErrors.limit)}
              disabled={isPending}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Dia de fechamento" htmlFor="card-closing-day" required error={fieldErrors.closingDay}>
              <Input
                id="card-closing-day"
                type="number"
                min={1}
                max={31}
                value={form.closingDay}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, closingDay: event.target.value }));
                  clearFieldError("closingDay");
                }}
                aria-invalid={Boolean(fieldErrors.closingDay)}
                disabled={isPending}
              />
            </FormField>
            <FormField label="Dia de vencimento" htmlFor="card-due-day" required error={fieldErrors.dueDay}>
              <Input
                id="card-due-day"
                type="number"
                min={1}
                max={31}
                value={form.dueDay}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, dueDay: event.target.value }));
                  clearFieldError("dueDay");
                }}
                aria-invalid={Boolean(fieldErrors.dueDay)}
                disabled={isPending}
              />
            </FormField>
          </div>
        </>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Cor do cartão</Label>
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
              title={option.label}
              aria-label={option.label}
              aria-pressed={form.color === option.value}
              disabled={isPending}
              style={{ background: cardGradient(option.value) }}
              className={cn(
                "h-8 w-11 shrink-0 rounded-[9px] ring-offset-2 ring-offset-background transition-all",
                form.color === option.value ? "ring-2 ring-foreground" : "opacity-70 hover:opacity-100",
              )}
            />
          ))}
        </div>
      </div>
    </>
  );
}
