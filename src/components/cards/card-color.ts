/**
 * Paleta de cor do cartão — reaproveita os tokens semânticos do design
 * system (nunca cores arbitrárias novas). `Card.color` guarda o nome do
 * token (ex.: "accent"), nunca um hex solto — as classes Tailwind ficam
 * fixas num dicionário (JIT precisa de classes literais, não de
 * interpolação `bg-${token}`).
 */
export const CARD_COLOR_OPTIONS = [
  { value: "primary", label: "Azul" },
  { value: "accent", label: "Laranja" },
  { value: "success", label: "Verde" },
  { value: "warning", label: "Amarelo" },
  { value: "destructive", label: "Vermelho" },
  { value: "transfer", label: "Ciano" },
  { value: "asset", label: "Roxo" },
] as const;

export type CardColorValue = (typeof CARD_COLOR_OPTIONS)[number]["value"];

const SWATCH_CLASSES: Record<CardColorValue, string> = {
  primary: "bg-primary",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  transfer: "bg-transfer",
  asset: "bg-asset",
};

const TINT_CLASSES: Record<CardColorValue, string> = {
  primary: "bg-primary/16 text-primary",
  accent: "bg-accent/16 text-accent",
  success: "bg-success/16 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  transfer: "bg-transfer/16 text-on-transfer",
  asset: "bg-asset/16 text-on-asset",
};

function isCardColorValue(value: string | null | undefined): value is CardColorValue {
  return CARD_COLOR_OPTIONS.some((option) => option.value === value);
}

/** Classe de fundo sólido — usada nos swatches do formulário. */
export function cardSwatchClass(color: string | null | undefined): string {
  return isCardColorValue(color) ? SWATCH_CLASSES[color] : "bg-muted-foreground/40";
}

/** Classe de tint (fundo 16% + texto) — usada no ícone do cartão na listagem/detalhe. */
export function cardTintClass(color: string | null | undefined): string {
  return isCardColorValue(color) ? TINT_CLASSES[color] : "bg-primary/16 text-primary";
}
