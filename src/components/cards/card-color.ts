/**
 * Paleta de cor do cartão. Os 7 primeiros valores reaproveitam os tokens
 * semânticos do design system (primary/accent/success/...); os demais são
 * tokens novos (genéricos + marcas de banco, ver `:root, .dark` em
 * `globals.css`) criados só pra este seletor, sempre como token — nunca hex
 * solto. `Card.color` guarda o nome do token (ex.: "accent", "nubank"),
 * nunca um hex — as classes Tailwind ficam fixas num dicionário (JIT precisa
 * de classes literais, não de interpolação `bg-${token}`).
 */
export const CARD_COLOR_OPTIONS = [
  { value: "primary", label: "Azul" },
  { value: "accent", label: "Laranja" },
  { value: "success", label: "Verde" },
  { value: "warning", label: "Amarelo" },
  { value: "destructive", label: "Vermelho" },
  { value: "transfer", label: "Ciano" },
  { value: "asset", label: "Roxo" },
  // Genéricos extras — mais opções no seletor (pedido do usuário).
  { value: "graphite", label: "Grafite" },
  { value: "midnight", label: "Meia-noite" },
  { value: "rose", label: "Rosé" },
  { value: "teal", label: "Turquesa" },
  { value: "indigo", label: "Índigo" },
  { value: "pink", label: "Pink" },
  // Marcas de banco (cor real da marca) — só faz sentido pra cartão, não
  // entra em CATEGORY_COLOR_OPTIONS.
  { value: "nubank", label: "Nubank" },
  { value: "itau", label: "Itaú" },
  { value: "inter", label: "Inter" },
  { value: "c6", label: "C6 Bank" },
  { value: "bradesco", label: "Bradesco" },
  { value: "santander", label: "Santander" },
  { value: "bb", label: "Banco do Brasil" },
  { value: "caixa", label: "Caixa" },
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
  graphite: "bg-graphite",
  midnight: "bg-midnight",
  rose: "bg-rose",
  teal: "bg-teal",
  indigo: "bg-indigo",
  pink: "bg-pink",
  nubank: "bg-nubank",
  itau: "bg-itau",
  inter: "bg-inter",
  c6: "bg-c6",
  bradesco: "bg-bradesco",
  santander: "bg-santander",
  bb: "bg-bb",
  caixa: "bg-caixa",
};

const TINT_CLASSES: Record<CardColorValue, string> = {
  primary: "bg-primary/16 text-primary",
  accent: "bg-accent/16 text-accent",
  success: "bg-success/16 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  transfer: "bg-transfer/16 text-on-transfer",
  asset: "bg-asset/16 text-on-asset",
  // graphite/midnight/nubank/c6/bradesco/bb/caixa são escuras/saturadas
  // demais pra ler como `text-*` direto sobre `--card` escuro (<3:1) — usam
  // a variante `on-*` mais clara, igual transfer/asset.
  graphite: "bg-graphite/16 text-on-graphite",
  midnight: "bg-midnight/16 text-on-midnight",
  rose: "bg-rose/16 text-rose",
  teal: "bg-teal/16 text-teal",
  indigo: "bg-indigo/16 text-indigo",
  pink: "bg-pink/16 text-pink",
  nubank: "bg-nubank/16 text-on-nubank",
  itau: "bg-itau/16 text-itau",
  inter: "bg-inter/16 text-inter",
  c6: "bg-c6/16 text-on-c6",
  bradesco: "bg-bradesco/16 text-on-bradesco",
  santander: "bg-santander/16 text-santander",
  bb: "bg-bb/16 text-on-bb",
  caixa: "bg-caixa/16 text-on-caixa",
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
