"use client";

import { CalendarDays } from "lucide-react";
import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

type DateFieldProps = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange"> & {
  /** `YYYY-MM-DD`, compatível com `dateInputSchema` (@/lib/date/schema). */
  value: string;
  onValueChange: (value: string) => void;
};

/**
 * Input de data usado em toda a aplicação (docs/06-SCREENS.md, "DateField").
 * Default: hoje em America/Sao_Paulo. `<input type="date">` já expõe o
 * seletor visual nativo e digitação rápida (dd/mm) — sem necessidade de uma
 * lib de calendário própria (nenhuma foi instalada, ver "Improvement
 * Suggestions" ao final).
 */
export function DateField({ value, onValueChange, className, ...props }: DateFieldProps) {
  return (
    <div className="relative">
      <CalendarDays
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="date"
        value={value || toDateInputValueSaoPaulo()}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          "pl-8 font-mono",
          // O indicador nativo do <input type="date"> (ícone de calendário do
          // browser) duplica o `CalendarDays` que já desenhamos à esquerda, e
          // não segue o estilo dos ícones do app. Deixamos ele invisível mas
          // esticado sobre todo o campo — continua clicável (abre o seletor
          // nativo), só não aparece mais visualmente.
          "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
          className,
        )}
        {...props}
      />
    </div>
  );
}
