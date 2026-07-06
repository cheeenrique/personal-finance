"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import { cn } from "@/lib/utils";

type DateFieldProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * `YYYY-MM-DD` é uma data de calendário pura (sem hora/fuso) — parse por
 * componentes evita a reinterpretação como UTC que `new Date(string)`
 * faria (deslocaria o dia exibido). Simetria com `toDateOnlyString` abaixo.
 */
function parseDateOnly(value: string): Date | undefined {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Seletor de data usado em toda a aplicação (docs/06-SCREENS.md, "DateField").
 * Popover + `Calendar` (shadcn/react-day-picker) temático — substituiu o
 * `<input type="date">` nativo, cujo calendário é renderizado pelo SO/browser
 * e não respeita o tema escuro do app. API (`value`/`onValueChange`, string
 * `YYYY-MM-DD`) ficou idêntica à anterior — nenhum dos 8 callers precisou
 * mudar.
 */
export function DateField({ id, value, onValueChange, disabled, className }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(value || toDateInputValueSaoPaulo());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("w-full justify-start gap-2 font-mono font-normal", className)}
          >
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
            {selected ? new Intl.DateTimeFormat("pt-BR").format(selected) : "Selecionar data"}
          </Button>
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={ptBR}
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onValueChange(toDateOnlyString(date));
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
