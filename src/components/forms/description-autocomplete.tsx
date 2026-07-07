"use client";

import { useEffect, useState } from "react";

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/components/ui/autocomplete";
import { suggestDescriptionsAction } from "@/modules/transactions/actions";

const SUGGESTION_DEBOUNCE_MS = 200;
const MIN_QUERY_LENGTH = 2;

type DescriptionAutocompleteProps = {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Disparado ao ESCOLHER uma sugestão (clique ou Enter) — nunca em digitação livre. */
  onSelectSuggestion?: (description: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
};

/**
 * Campo de Descrição com autocomplete das descrições anteriores do próprio
 * usuário (docs/20-TRANSACTIONS.md) — acelera lançamentos repetidos ("Mercado",
 * "Uber"...) sem travar texto livre novo. As sugestões vêm já rankeadas/
 * limitadas do servidor (`suggestDescriptionsAction`), então o Root roda com
 * `mode="none"`: a lista exibida é exatamente o array recebido, sem
 * refiltragem client-side.
 *
 * Usa `@base-ui/react/autocomplete` em vez do padrão `EntitySelect` (Popover +
 * cmdk) porque implementa nativamente o padrão ARIA 1.2 combobox
 * (`aria-activedescendant`/`role=listbox`/`role=option`) — o `cmdk` usado no
 * `EntitySelect` não expõe esses atributos, e aqui o campo é texto livre (não
 * uma seleção de lista fixa), então o encaixe do `EntitySelect` não se aplica.
 */
export function DescriptionAutocomplete({
  id,
  value,
  onValueChange,
  onSelectSuggestion,
  placeholder,
  disabled,
  "aria-invalid": ariaInvalid,
}: DescriptionAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // Busca sugestões com debounce sempre que o texto digitado muda — mesmo
  // idioma de `DataTable` (`SEARCH_DEBOUNCE_MS`), aqui mais curto (200ms) por
  // ser feedback enquanto-digita num único campo, não uma busca de listagem.
  // Query curta demais não dispara fetch — só filtra a exibição abaixo
  // (`visibleSuggestions`), sem precisar de um `setState` síncrono aqui
  // dentro do efeito (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    const query = value.trim();
    if (query.length < MIN_QUERY_LENGTH) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      suggestDescriptionsAction(query).then((result) => {
        if (!cancelled && result.success) setSuggestions(result.data);
      });
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  const hasQuery = value.trim().length >= MIN_QUERY_LENGTH;
  const visibleSuggestions = hasQuery ? suggestions : [];
  const open = !dismissed && visibleSuggestions.length > 0;

  return (
    <Autocomplete
      items={visibleSuggestions}
      value={value}
      onValueChange={(next) => {
        onValueChange(next);
        setDismissed(false);
      }}
      mode="none"
      disabled={disabled}
      open={open}
      onOpenChange={(nextOpen) => {
        // Fechamento explícito (Esc, clique fora, seleção) — não reabre
        // sozinho até o texto mudar de novo (digitar reseta `dismissed`
        // acima), senão o dropdown reapareceria sem o usuário pedir.
        if (!nextOpen) setDismissed(true);
      }}
    >
      <AutocompleteInput id={id} placeholder={placeholder} aria-invalid={ariaInvalid} disabled={disabled} />
      <AutocompleteContent align="start">
        <AutocompleteList>
          {(item: string) => (
            <AutocompleteItem key={item} value={item} onClick={() => onSelectSuggestion?.(item)}>
              {item}
            </AutocompleteItem>
          )}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}
