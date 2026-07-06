"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/**
 * Detecta se já passamos da hidratação — usado quando o valor real só
 * existe no client (ex.: `next-themes` `resolvedTheme`) e o placeholder de
 * SSR precisa ser estável. Via `useSyncExternalStore` (getServerSnapshot
 * sempre `false`, getSnapshot sempre `true`): React corrige o mismatch numa
 * única re-renderização pós-hidratação, sem precisar de `useEffect` +
 * `useState` (evita `react-hooks/set-state-in-effect`).
 */
export function useHasMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
