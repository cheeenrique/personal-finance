"use client";

import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CurrencyInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  /** Valor decimal (`"123.45"`), compatível com `decimalStringSchema` (@/lib/money/schema) — nunca float cru. */
  value: string;
  onValueChange: (decimalValue: string) => void;
};

function centsToDisplay(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
}

function decimalToCents(decimal: string): number {
  const amount = Number(decimal);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

/**
 * Input de valor monetário (docs/06-SCREENS.md, "CurrencyInput"). Máscara
 * BRL em tempo real operando sobre centavos (inteiro) internamente — nunca
 * `parseFloat` de string mascarada. Sempre positivo: o sinal é definido pelo
 * tipo da transação, nunca pelo valor.
 *
 * Totalmente controlado: o valor exibido é derivado de `value` (prop) a
 * cada render — sem estado local nem efeito de sincronização (o parent já
 * recebe o decimal atualizado a cada tecla via `onValueChange`).
 */
export function CurrencyInput({ value, onValueChange, className, ...props }: CurrencyInputProps) {
  const cents = decimalToCents(value);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digitsOnly = event.target.value.replace(/\D/g, "");
    const nextCents = digitsOnly ? Number(digitsOnly) : 0;
    onValueChange((nextCents / 100).toFixed(2));
  }

  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      className={cn("font-mono", className)}
      value={cents === 0 ? "" : centsToDisplay(cents)}
      onChange={handleChange}
      placeholder="R$ 0,00"
      {...props}
    />
  );
}
