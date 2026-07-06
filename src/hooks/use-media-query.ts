"use client";

import { useSyncExternalStore } from "react";

/**
 * Wrapper de `matchMedia` via `useSyncExternalStore` — evita o clássico bug
 * de mismatch de hidratação (server não conhece a viewport do client).
 * Usado para decidir Dialog (desktop) vs. Sheet (mobile) no `FormModal` e
 * para esconder/mostrar Sidebar vs. BottomNav.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Breakpoint desktop travado em `04-DESIGN_SYSTEM.md`/handoff: sidebar aparece só a partir de 1280px. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}
