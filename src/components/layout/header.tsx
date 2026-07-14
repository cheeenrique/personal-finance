"use client";

import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { findNavItemByPathname } from "./nav-config";
import { HeaderThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { useShell } from "@/components/providers/shell-provider";
import { FOCUS_RING_CLASS, cn } from "@/lib/utils";

type HeaderProps = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Header sticky do shell autenticado (docs/06-SCREENS.md, "Header").
 * Título/descrição dinâmicos por rota (via `nav-config.ts`, mapa único).
 */
export function Header({ name, email }: HeaderProps) {
  const pathname = usePathname();
  const { openCommandPalette, openTransactionModal } = useShell();
  const navItem = findNavItemByPathname(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-border bg-background/82 px-4 py-3.5 backdrop-blur-[14px] sm:px-7">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] leading-none font-black tracking-[-0.02em] text-foreground">
          {navItem?.label ?? "Personal Finance"}
        </h1>
        <p className="mt-[2px] truncate text-[12.5px] leading-none font-semibold text-muted-foreground">
          {navItem?.description ?? ""}
        </p>
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        className={cn(
          "hidden h-[38px] w-[220px] items-center gap-2.5 rounded-[10px] border border-border bg-input px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:border-primary/40 sm:flex",
          FOCUS_RING_CLASS,
        )}
      >
        <Search className="size-[15px] shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate text-left">Buscar…</span>
        <kbd className="shrink-0 rounded-[6px] bg-secondary px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Buscar"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-border text-muted-foreground sm:hidden",
          FOCUS_RING_CLASS,
        )}
      >
        <Search className="size-[17px]" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => openTransactionModal()}
        className={cn(
          // Escondido no mobile (o FAB "+" da BottomNav já cobre "nova transação");
          // só aparece no desktop (sm+), que não tem BottomNav.
          // Texto branco por decisão do handoff (não `accent-foreground`/navy,
          // reservado pras badges sólidas de Despesa/Receita).
          "hidden h-[38px] shrink-0 items-center gap-2 rounded-[10px] bg-accent px-4 text-[13.5px] font-extrabold text-white shadow-[0_6px_16px_rgba(234,88,12,0.38)] transition-[filter] duration-150 ease-pf-out hover:brightness-[1.06] sm:inline-flex",
          FOCUS_RING_CLASS,
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Nova transação</span>
      </button>

      <div className="hidden sm:block">
        <HeaderThemeToggle />
      </div>

      <UserMenu name={name} email={email} />
    </header>
  );
}
