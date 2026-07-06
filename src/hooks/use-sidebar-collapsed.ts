"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "pf:sidebar-collapsed";
const listeners = new Set<() => void>();

function readCollapsed(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot() {
  return false;
}

/**
 * Estado de colapso da Sidebar persistido em `localStorage`
 * (docs/06-SCREENS.md, "Sidebar"). Implementado como store externo em vez de
 * `useState` + `useEffect` — evita ler `localStorage` num efeito
 * (`react-hooks/set-state-in-effect`) e mantém múltiplas instâncias em
 * sincronia via o `Set` de listeners compartilhado.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, getServerSnapshot);

  const toggle = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, readCollapsed() ? "0" : "1");
    listeners.forEach((listener) => listener());
  }, []);

  return [collapsed, toggle];
}
