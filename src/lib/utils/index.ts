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

/**
 * Preto ou branco por luminância relativa (WCAG) — usado pro ícone de
 * "selecionado" sobre swatches de cor arbitrária (category/tag/account
 * color picker, docs/50-AUDITORIA-BACKLOG.md, LA4): um `text-white` fixo some
 * em swatches claros (âmbar, amarelo). Limiar 0.18 é o ponto de corte onde
 * preto passa a garantir 4.5:1 (AA) contra o fundo com folga maior que
 * branco — abaixo dele branco é a escolha mais segura.
 */
export function getContrastText(hex: string): "#000000" | "#ffffff" {
  const value = hex.replace("#", "");
  const channel = (start: number) => parseInt(value.slice(start, start + 2), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance =
    0.2126 * linear(channel(0)) + 0.7152 * linear(channel(2)) + 0.0722 * linear(channel(4));
  return luminance > 0.18 ? "#000000" : "#ffffff";
}
