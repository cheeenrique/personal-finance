"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type EntitySelectOption = {
  value: string;
  label: string;
  group?: string;
  icon?: ReactNode;
};

type EntitySelectProps = {
  options: EntitySelectOption[];
  value: string | undefined;
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /** `createOnTheFly` — cria a opção direto no fluxo (docs/06-SCREENS.md, "EntitySelect"). */
  onCreate?: (label: string) => void;
  createLabel?: (query: string) => string;
};

/**
 * Select padrão para qualquer entidade (categoria, conta, cartão, tag),
 * usado dentro dos formulários. Lista tudo quando ≤10 itens (sem busca
 * visível); ativa busca interna quando >10 (docs/06-SCREENS.md,
 * "EntitySelect"). 100% navegável por teclado via cmdk.
 */
export function EntitySelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione…",
  emptyMessage = "Nada encontrado.",
  disabled,
  className,
  onCreate,
  createLabel = (query) => `Criar "${query}"`,
}: EntitySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchable = options.length > 10;

  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  const groups = useMemo(() => {
    const map = new Map<string | undefined, EntitySelectOption[]>();
    for (const option of options) {
      const key = option.group;
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return map;
  }, [options]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <button
            type="button"
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-input px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/28 disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
          />
        }
      >
        <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-muted-foreground")}>
          {selected?.icon}
          <span className="truncate">{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>

      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command shouldFilter={searchable}>
          {searchable && (
            <CommandInput
              placeholder="Buscar…"
              value={query}
              onValueChange={setQuery}
            />
          )}
          <CommandList className="max-h-[300px]">
            <CommandEmpty>
              {onCreate && query.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    onCreate(query.trim());
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-primary hover:bg-secondary"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {createLabel(query.trim())}
                </button>
              ) : (
                emptyMessage
              )}
            </CommandEmpty>

            {[...groups.entries()].map(([group, groupOptions]) => (
              <CommandGroup key={group ?? "__ungrouped"} heading={group}>
                {groupOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value}`}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                  >
                    {option.icon}
                    <span className="truncate">{option.label}</span>
                    {option.value === value && (
                      <Check className="ml-auto size-4 text-primary" aria-hidden="true" />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
