"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CreditCard,
  FolderTree,
  Plus,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { NAV_ITEMS } from "./nav-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { useShell } from "@/components/providers/shell-provider";
import { searchEntitiesAction } from "@/modules/search/actions";
import type { SearchEntityKind, SearchResultItem } from "@/modules/search/types";
import { AccountFormModal } from "@/components/accounts/account-form-modal";
import { CardFormModal } from "@/components/cards/card-form-modal";

/**
 * "Nova conta"/"Novo cartão" abrem o `FormModal` direto (docs/50-AUDITORIA-
 * BACKLOG.md, F6); "Nova categoria"/"Nova tag" continuam só navegando (fora
 * do escopo do F6, que lista apenas conta/cartão pro Command Palette).
 */
type PaletteQuickAction =
  | { kind: "account" | "card"; label: string; icon: LucideIcon }
  | { kind: "link"; label: string; icon: LucideIcon; href: string };

const QUICK_ACTIONS: PaletteQuickAction[] = [
  { kind: "account", label: "Nova conta", icon: Wallet },
  { kind: "card", label: "Novo cartão", icon: CreditCard },
  { kind: "link", label: "Nova categoria", icon: FolderTree, href: "/categories" },
  { kind: "link", label: "Nova tag", icon: Tag, href: "/tags" },
];

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

const KIND_ORDER: SearchEntityKind[] = [
  "transaction",
  "account",
  "card",
  "category",
  "tag",
];

const KIND_LABELS: Record<SearchEntityKind, string> = {
  transaction: "Transações",
  account: "Contas",
  card: "Cartões",
  category: "Categorias",
  tag: "Tags",
};

const KIND_ICONS: Record<SearchEntityKind, LucideIcon> = {
  transaction: ArrowLeftRight,
  account: Wallet,
  card: CreditCard,
  category: FolderTree,
  tag: Tag,
};

/** Agrupa os resultados por tipo de entidade, na ordem fixa de `KIND_ORDER` (docs/06-SCREENS.md, "Resultados agrupados por tipo de entidade"). */
function groupByKind(
  items: SearchResultItem[],
): Array<[SearchEntityKind, SearchResultItem[]]> {
  return KIND_ORDER.map((kind): [SearchEntityKind, SearchResultItem[]] => [
    kind,
    items.filter((item) => item.kind === kind),
  ]).filter(([, groupItems]) => groupItems.length > 0);
}

/**
 * Overlay modal (`Ctrl+K`), abre de qualquer tela autenticada
 * (docs/06-SCREENS.md, "Command Palette"). Ações rápidas + navegação sempre
 * visíveis (filtradas pelo próprio `cmdk` conforme o texto digitado); busca de
 * entidades (transações por descrição, contas/cartões/categorias/tags por
 * nome — `modules/search`) roda com debounce ~300ms e aparece agrupada por
 * tipo, abaixo dos itens estáticos.
 */
export function CommandPalette() {
  const router = useRouter();
  const { isCommandPaletteOpen, closeCommandPalette, openTransactionModal } = useShell();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setSearching] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [cardModalOpen, setCardModalOpen] = useState(false);

  // Reset ao reabrir — sync durante o render (mesmo padrão de `PayInvoiceModal`), não em efeito.
  const [wasOpen, setWasOpen] = useState(isCommandPaletteOpen);
  if (isCommandPaletteOpen !== wasOpen) {
    setWasOpen(isCommandPaletteOpen);
    if (isCommandPaletteOpen) {
      setQuery("");
      setDebouncedQuery("");
      setResults([]);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const hasQuery = debouncedQuery.length >= MIN_QUERY_LENGTH;

  // Busca entidades (Server Action) só quando a query tem tamanho mínimo —
  // efeito legítimo: sincroniza com sistema externo. `setSearching(true)`
  // dentro do `.then()` (não síncrono no corpo do efeito) evita cascading
  // renders, mesmo padrão de `PayInvoiceModal`/`InstallmentFormModal`.
  useEffect(() => {
    if (!hasQuery) return;

    let cancelled = false;

    Promise.resolve()
      .then(() => {
        setSearching(true);
        return searchEntitiesAction(debouncedQuery);
      })
      .then((result) => {
        if (cancelled) return;
        setResults(result.success ? result.data : []);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, hasQuery]);

  // `results` só é agrupado enquanto a query ainda for válida — evita mostrar
  // resultado de uma busca antiga depois que o usuário apagou o texto (sem
  // precisar "limpar" o state num setState síncrono dentro do efeito acima).
  const groupedResults = useMemo(
    () => (hasQuery ? groupByKind(results) : []),
    [hasQuery, results],
  );

  function go(href: string) {
    closeCommandPalette();
    router.push(href);
  }

  function handleQuickAction(action: PaletteQuickAction) {
    if (action.kind === "link") {
      go(action.href);
      return;
    }

    closeCommandPalette();
    if (action.kind === "account") setAccountModalOpen(true);
    else setCardModalOpen(true);
  }

  function goToResult(item: SearchResultItem) {
    closeCommandPalette();
    router.push(item.href);
  }

  return (
    <>
      <CommandDialog
        open={isCommandPaletteOpen}
        onOpenChange={closeCommandPalette}
        title="Busca global"
        description="Busque transações, contas, cartões, categorias e tags, ou execute uma ação rápida"
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Buscar transações, contas, cartões…"
        />
        <CommandList>
          {!(hasQuery && isSearching) && (
            <CommandEmpty>
              {hasQuery
                ? `Nada encontrado para "${debouncedQuery}".`
                : "Nada encontrado."}
            </CommandEmpty>
          )}

          <CommandGroup heading="Ações rápidas">
            <CommandItem
              value="nova transação criar lançamento"
              onSelect={() => {
                closeCommandPalette();
                openTransactionModal();
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Nova transação
              <CommandShortcut>Ctrl N</CommandShortcut>
            </CommandItem>
            {QUICK_ACTIONS.map((action) => (
              <CommandItem
                key={action.label}
                value={action.label}
                onSelect={() => handleQuickAction(action)}
              >
                <action.icon className="size-4" aria-hidden="true" />
                {action.label}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Navegação">
            {NAV_ITEMS.map((item) => (
              <CommandItem
                key={item.href}
                value={item.label}
                onSelect={() => go(item.href)}
              >
                <item.icon className="size-4" aria-hidden="true" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>

          {hasQuery && isSearching && (
            <div className="flex flex-col gap-1.5 p-2" aria-hidden="true">
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
              <Skeleton className="h-8 w-full rounded-md" />
            </div>
          )}

          {!isSearching &&
            groupedResults.map(([kind, items]) => {
              const Icon = KIND_ICONS[kind];
              return (
                <CommandGroup key={kind} heading={KIND_LABELS[kind]}>
                  {items.map((item) => (
                    <CommandItem
                      key={`${item.kind}-${item.id}`}
                      value={`${item.title} ${item.subtitle ?? ""}`}
                      onSelect={() => goToResult(item)}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
        </CommandList>
      </CommandDialog>

      <AccountFormModal
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
        account={null}
      />
      <CardFormModal open={cardModalOpen} onOpenChange={setCardModalOpen} card={null} />
    </>
  );
}
