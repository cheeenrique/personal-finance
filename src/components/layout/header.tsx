"use client";

import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";

import { findNavItemByPathname } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { Button } from "@/components/ui/button";
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
    <header className="sticky top-0 z-20 flex h-14 items-center gap-5 border-b border-border bg-background/82 px-4 py-3.5 backdrop-blur-[14px] sm:px-7">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] font-black tracking-[-0.02em] text-foreground">
          {navItem?.label ?? "Personal Finance"}
        </h1>
        <p className="mt-0.5 truncate text-[12.5px] font-semibold text-muted-foreground">
          {navItem?.description ?? ""}
        </p>
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        className={cn(
          "hidden h-[38px] min-w-[200px] max-w-[340px] flex-1 items-center gap-2 rounded-[10px] border border-border bg-input px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 sm:flex",
          FOCUS_RING_CLASS,
        )}
      >
        <Search className="size-[15px] shrink-0" aria-hidden="true" />
        <span className="truncate">Buscar…</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground lg:inline">
          Ctrl K
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

      <Button
        type="button"
        variant="accent"
        size="lg"
        onClick={() => openTransactionModal()}
        className="shrink-0 rounded-[11px]"
      >
        <Plus className="size-[15px]" aria-hidden="true" />
        <span className="hidden sm:inline">Nova transação</span>
      </Button>

      <div className="hidden sm:block">
        <ThemeToggle />
      </div>

      <UserMenu name={name} email={email} />
    </header>
  );
}
