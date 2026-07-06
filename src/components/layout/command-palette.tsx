"use client";

import { useRouter } from "next/navigation";
import { Plus, Wallet, CreditCard, FolderTree, Tag } from "lucide-react";

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
import { useShell } from "@/components/providers/shell-provider";

const QUICK_ACTIONS = [
  { label: "Nova conta", icon: Wallet, href: "/accounts" },
  { label: "Novo cartão", icon: CreditCard, href: "/cards" },
  { label: "Nova categoria", icon: FolderTree, href: "/categories" },
  { label: "Nova tag", icon: Tag, href: "/tags" },
] as const;

/**
 * Overlay modal (`Ctrl+K`), abre de qualquer tela autenticada
 * (docs/06-SCREENS.md, "Command Palette"). Ações rápidas sempre visíveis;
 * busca de entidades (transações/contas/cartões/categorias/tags/patrimônio)
 * fica como stub por ora — a navegação por rota já é 100% funcional.
 */
export function CommandPalette() {
  const router = useRouter();
  const { isCommandPaletteOpen, closeCommandPalette, openTransactionModal } = useShell();

  function go(href: string) {
    closeCommandPalette();
    router.push(href);
  }

  return (
    <CommandDialog
      open={isCommandPaletteOpen}
      onOpenChange={closeCommandPalette}
      title="Busca global"
      description="Navegue ou execute uma ação rápida"
    >
      <CommandInput placeholder="Buscar ou executar uma ação…" />
      <CommandList>
        <CommandEmpty>Nada encontrado.</CommandEmpty>

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
              key={action.href}
              value={action.label}
              onSelect={() => go(action.href)}
            >
              <action.icon className="size-4" aria-hidden="true" />
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navegação">
          {NAV_ITEMS.map((item) => (
            <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
              <item.icon className="size-4" aria-hidden="true" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
