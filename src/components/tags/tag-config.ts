/**
 * Paleta fixa de cores para o seletor de cor da tag — mesma abordagem de
 * `components/accounts/account-config.ts` (mero estilo, sem semântica
 * financeira, DRY prematuro evitado: paletas curadas por feature, não
 * compartilhadas até um 3º consumidor aparecer).
 */
export const TAG_COLOR_OPTIONS: string[] = [
  "#1E40AF",
  "#0EA5E9",
  "#16A34A",
  "#EA580C",
  "#7C3AED",
  "#F59E0B",
  "#EF4444",
  "#64748B",
];

export const DEFAULT_TAG_COLOR = TAG_COLOR_OPTIONS[0];
