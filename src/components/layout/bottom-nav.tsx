"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Plus } from "lucide-react";

import { BOTTOM_NAV_ITEMS, DRAWER_NAV_ITEMS } from "./nav-config";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useShell } from "@/components/providers/shell-provider";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

/**
 * Substitui a Sidebar em mobile/tablet (<1280px). Nunca ambos ao mesmo
 * tempo (docs/06-SCREENS.md, "Bottom Navigation"). `[+]` central abre o
 * mesmo FormDrawer de nova transação do Header/Ctrl+N.
 */
export function BottomNav() {
  const pathname = usePathname();
  const { openTransactionModal } = useShell();
  const [menuOpen, setMenuOpen] = useState(false);

  const [dashboardItem, transactionsItem, cardsItem] = BOTTOM_NAV_ITEMS;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-16 items-center justify-between border-t border-border bg-card xl:hidden">
        <BottomNavLink item={dashboardItem} pathname={pathname} />
        <BottomNavLink item={transactionsItem} pathname={pathname} />

        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => openTransactionModal()}
            aria-label="Nova transação"
            className={cn(
              "absolute bottom-8 flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_16px_rgba(234,88,12,0.45)]",
              FOCUS_RING_CLASS,
            )}
          >
            <Plus className="size-6" aria-hidden="true" />
          </button>
        </div>

        <BottomNavLink item={cardsItem} pathname={pathname} />

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className={cn(
            "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-muted-foreground",
            FOCUS_RING_CLASS,
          )}
        >
          <Menu className="size-5" aria-hidden="true" />
          <span className="text-[10px] font-bold">Menu</span>
        </button>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Navegação</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
            {DRAWER_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-[10px] border-l-[3px] border-transparent px-3 text-sm",
                    isActive
                      ? "border-l-primary bg-primary/14 font-extrabold text-foreground"
                      : "font-semibold text-muted-foreground",
                    FOCUS_RING_CLASS,
                  )}
                >
                  <item.icon className="size-[19px]" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

function BottomNavLink({
  item,
  pathname,
}: {
  item: (typeof BOTTOM_NAV_ITEMS)[number];
  pathname: string;
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex h-16 flex-1 flex-col items-center justify-center gap-1",
        isActive ? "text-accent" : "text-muted-foreground",
        FOCUS_RING_CLASS,
      )}
    >
      <item.icon className="size-5" aria-hidden="true" />
      <span className="text-[10px] font-bold">{item.label}</span>
    </Link>
  );
}
