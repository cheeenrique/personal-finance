"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { Tag } from "@/modules/tags/types";
import { cn } from "@/lib/utils";

type TagMultiSelectProps = {
  tags: Tag[];
  value: string[];
  onValueChange: (tagIds: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Multi-seleção de tags do form de edição de transação
 * (docs/06-SCREENS.md, "Transações" — "tags via multi-select"). `EntitySelect`
 * (@/components/forms/entity-select) é single-value só; tags são o único
 * campo N:N do módulo (`TransactionTag`, docs/03-DATABASE.md) — daqui vem a
 * necessidade de um componente próprio, colocado aqui (feature-specific).
 */
export function TagMultiSelect({ tags, value, onValueChange, disabled, placeholder = "Selecionar tags…" }: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = tags.filter((tag) => value.includes(tag.id));

  function toggle(tagId: string) {
    onValueChange(value.includes(tagId) ? value.filter((id) => id !== tagId) : [...value, tagId]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <button
              type="button"
              className="flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-input px-3 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/28 disabled:cursor-not-allowed disabled:opacity-50"
            />
          }
        >
          <span className={cn("truncate", selected.length === 0 && "text-muted-foreground")}>
            {selected.length > 0 ? `${selected.length} tag(s) selecionada(s)` : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </PopoverTrigger>

        <PopoverContent className="w-(--anchor-width) p-0" align="start">
          <Command>
            {tags.length > 10 && <CommandInput placeholder="Buscar tag…" />}
            <CommandList className="max-h-[240px]">
              <CommandEmpty>Nenhuma tag cadastrada.</CommandEmpty>
              <CommandGroup>
                {tags.map((tag) => (
                  <CommandItem key={tag.id} value={tag.name} onSelect={() => toggle(tag.id)}>
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{tag.name}</span>
                    {value.includes(tag.id) && <Check className="ml-auto size-4 text-primary" aria-hidden="true" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground"
            >
              {tag.name}
              <button
                type="button"
                onClick={() => toggle(tag.id)}
                disabled={disabled}
                aria-label={`Remover tag ${tag.name}`}
                className="rounded-full hover:text-destructive"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
