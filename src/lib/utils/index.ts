import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sombra padrão de cards/superfícies elevadas (docs/04-DESIGN_SYSTEM.md,
 * "Card" — `--pf-shadow`). Mantida como constante em vez de token CSS: só é
 * consumida aqui, então uma classe utilitária compartilhada já resolve o
 * DRY sem precisar de mais uma custom property global (rule 02-dry-kiss-yagni).
 */
export const CARD_SHADOW_CLASS =
  "shadow-[0_2px_12px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)]";

/**
 * Focus ring padrão pra elementos interativos "crus" (sem passar por
 * `ui/button.tsx`/`ui/input.tsx`, que já têm o próprio tratamento de foco) —
 * design/PERSONAL_FINANCE_DS_HANDOFF.md, "Focus Management": 2px --primary,
 * offset 2px.
 */
export const FOCUS_RING_CLASS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
