import {
  CreditCard,
  Wallet,
  Landmark,
  ShoppingBag,
  Banknote,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** Ícones disponíveis pro cartão — subconjunto curado do lucide-react. `Card.icon` guarda o `value` (ex.: "wallet"). */
export const CARD_ICON_OPTIONS = [
  { value: "credit-card", label: "Cartão", icon: CreditCard },
  { value: "wallet", label: "Carteira", icon: Wallet },
  { value: "landmark", label: "Banco", icon: Landmark },
  { value: "shopping-bag", label: "Compras", icon: ShoppingBag },
  { value: "banknote", label: "Dinheiro", icon: Banknote },
  { value: "sparkles", label: "Premium", icon: Sparkles },
] as const;

/**
 * Lookup direto (não uma função) — `react-hooks/static-components` acusa
 * "componente criado durante o render" quando o valor usado como tag JSX vem
 * do retorno de uma function call; indexar um `Record` module-level (mesmo
 * padrão de `TYPE_CONFIG`/`Icon` em `transaction-type-badge.tsx`) já é
 * estaticamente analisável como estável.
 */
export const CARD_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CARD_ICON_OPTIONS.map((option) => [option.value, option.icon]),
);

export const DEFAULT_CARD_ICON = CreditCard;
