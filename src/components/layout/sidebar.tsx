"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, TrendingUp } from "lucide-react";

import { NAV_ITEMS } from "./nav-config";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

type SidebarProps = {
  name: string | null | undefined;
  email: string | null | undefined;
};

/**
 * Sidebar fixa (desktop, ≥1280px) — 248px expandida / 74px recolhida,
 * estado persistido em `localStorage` (docs/06-SCREENS.md, "Sidebar").
 * Nunca renderizada junto com a BottomNav (breakpoint controla via CSS).
 */
export function Sidebar({ name, email }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();

  const initials = (name?.trim() || email?.trim() || "?").slice(0, 2).toUpperCase();

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200 ease-in-out lg:flex",
        collapsed ? "w-[74px]" : "w-[248px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-3">
        <span className="flex size-[38px] shrink-0 items-center justify-center rounded-[9px] bg-[linear-gradient(135deg,#1E40AF_0%,#0F2A5F_100%)]">
          <TrendingUp className="size-5 text-accent" aria-hidden="true" />
        </span>
        {!collapsed && (
          <span className="flex min-w-0 flex-col leading-none">
            <span className="truncate text-base font-black tracking-[-0.02em] text-foreground">
              Personal
            </span>
            <span className="mt-[3px] truncate text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              Finance
            </span>
          </span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const link = (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-[10px] border-l-[3px] border-transparent px-3 text-sm transition-colors",
                isActive
                  ? "border-l-primary bg-primary/14 font-extrabold text-foreground"
                  : "font-semibold text-muted-foreground hover:text-foreground",
                collapsed && "justify-center px-0",
                FOCUS_RING_CLASS,
              )}
            >
              <item.icon className="size-[19px] shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );

          if (!collapsed) return link;

          return (
            <Tooltip key={item.href}>
              <TooltipTrigger render={link} />
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div
        className={cn(
          "flex items-center gap-2.5 border-t border-border p-3",
          collapsed && "flex-col gap-2",
        )}
      >
        <span className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent to-orange-700 text-xs font-bold text-white">
          {initials}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-extrabold text-foreground">
              {name ?? "Usuário"}
            </span>
            <span className="block truncate text-[11px] font-semibold text-muted-foreground">
              {email ?? ""}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
            FOCUS_RING_CLASS,
          )}
        >
          <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>
    </aside>
  );
}
