"use client"

import * as React from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"

import { cn } from "@/lib/utils/index"

// Fixado em `string` (não genérico) — único uso hoje é lista de sugestões de
// texto (`DescriptionAutocomplete`); generalizar pra `ItemValue` colide com a
// resolução de overloads do `AutocompleteRoot` (union `items`/`Group<items>`
// não resolve através de spread genérico). Generalizar quando aparecer o 2º
// caso concreto (rule 02-dry-kiss-yagni).
function Autocomplete({
  ...props
}: AutocompletePrimitive.Root.Props<string>) {
  // `Root.Props<T>` (o alias de tipo) não estreita `items` pra `T[]` — o
  // campo vem largo (`any[] | Group<any>[]`) da interface base do Combobox
  // independente do genérico; só os overloads da função `AutocompleteRoot`
  // estreitam de verdade, e eles não resolvem bem contra um spread já
  // tipado. Cast local e contido — o tipo público deste wrapper (acima)
  // já garante `items?: string[]` pra quem consome.
  return <AutocompletePrimitive.Root data-slot="autocomplete" {...(props as AutocompletePrimitive.Root.Props<string> & { items?: readonly string[] })} />
}

function AutocompleteInput({
  className,
  ...props
}: AutocompletePrimitive.Input.Props) {
  return (
    <AutocompletePrimitive.Input
      data-slot="autocomplete-input"
      className={cn(
        // Mesma aparência de `ui/input.tsx` — este campo é um input de texto
        // comum com sugestões por cima, não um select (docs/04-DESIGN_SYSTEM.md, "Input/TextField").
        "h-10 w-full min-w-0 rounded-lg border border-border bg-input px-3 py-1 text-base font-medium transition-colors outline-none placeholder:text-muted-foreground hover:border-primary/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

function AutocompleteContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}: AutocompletePrimitive.Popup.Props &
  Pick<
    AutocompletePrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <AutocompletePrimitive.Portal>
      <AutocompletePrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <AutocompletePrimitive.Popup
          data-slot="autocomplete-content"
          className={cn(
            "z-50 w-(--anchor-width) max-h-[280px] overflow-hidden rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props) {
  return (
    <AutocompletePrimitive.List
      data-slot="autocomplete-list"
      className={cn(
        "no-scrollbar max-h-[260px] scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        className
      )}
      {...props}
    />
  )
}

function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none data-highlighted:bg-muted data-highlighted:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  )
}

export {
  Autocomplete,
  AutocompleteInput,
  AutocompleteContent,
  AutocompleteList,
  AutocompleteItem,
}
