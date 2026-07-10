import {
  Wallet,
  Landmark,
  PiggyBank,
  Banknote,
  Building2,
  CreditCard,
  Coins,
  CircleDollarSign,
  Vault,
  HandCoins,
  BadgeDollarSign,
  DollarSign,
  Bitcoin,
  TrendingUp,
  ChartLine,
  Briefcase,
  Receipt,
  Gem,
  Smartphone,
  type LucideIcon,
} from "lucide-react";

import { AccountType } from "@/generated/prisma/enums";

/** Rótulo em pt-BR por tipo de conta (docs/21-ACCOUNTS.md, "Tipos de Conta"). */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  [AccountType.CHECKING]: "Conta corrente",
  [AccountType.SAVINGS]: "Poupança",
  [AccountType.CASH]: "Dinheiro físico",
  [AccountType.BUSINESS]: "Conta PJ",
  [AccountType.OTHER]: "Outros",
};

export const ACCOUNT_TYPE_OPTIONS = Object.values(AccountType).map((type) => ({
  value: type,
  label: ACCOUNT_TYPE_LABELS[type],
}));

/** Ícone padrão por tipo — usado quando a conta não define um ícone próprio. */
export const ACCOUNT_TYPE_ICONS: Record<AccountType, LucideIcon> = {
  [AccountType.CHECKING]: Landmark,
  [AccountType.SAVINGS]: PiggyBank,
  [AccountType.CASH]: Banknote,
  [AccountType.BUSINESS]: Building2,
  [AccountType.OTHER]: Wallet,
};

/** Conjunto curado de ícones selecionáveis no formulário (`icon` guarda a key). */
export const ACCOUNT_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "wallet", label: "Carteira", icon: Wallet },
  { value: "landmark", label: "Banco", icon: Landmark },
  { value: "piggy-bank", label: "Poupança", icon: PiggyBank },
  { value: "banknote", label: "Dinheiro", icon: Banknote },
  { value: "building-2", label: "Empresa", icon: Building2 },
  { value: "credit-card", label: "Cartão", icon: CreditCard },
  { value: "coins", label: "Moedas", icon: Coins },
  { value: "circle-dollar-sign", label: "Cifrão", icon: CircleDollarSign },
  { value: "vault", label: "Cofre", icon: Vault },
  { value: "hand-coins", label: "Recebimento", icon: HandCoins },
  { value: "badge-dollar-sign", label: "Selo de valor", icon: BadgeDollarSign },
  { value: "dollar-sign", label: "Dólar", icon: DollarSign },
  { value: "bitcoin", label: "Cripto", icon: Bitcoin },
  { value: "trending-up", label: "Investimento", icon: TrendingUp },
  { value: "chart-line", label: "Rendimentos", icon: ChartLine },
  { value: "briefcase", label: "Empresarial", icon: Briefcase },
  { value: "receipt", label: "Fatura", icon: Receipt },
  { value: "gem", label: "Reserva de valor", icon: Gem },
  { value: "smartphone", label: "Banco digital", icon: Smartphone },
];

export const ACCOUNT_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  ACCOUNT_ICON_OPTIONS.map((option) => [option.value, option.icon]),
);

/** Paleta fixa de cores para personalização do card — mero estilo, sem semântica financeira. */
export const ACCOUNT_COLOR_OPTIONS: string[] = [
  "#1E40AF",
  "#0EA5E9",
  "#16A34A",
  "#EA580C",
  "#7C3AED",
  "#F59E0B",
  "#EF4444",
  "#64748B",
];

export const DEFAULT_ACCOUNT_COLOR = ACCOUNT_COLOR_OPTIONS[0];
