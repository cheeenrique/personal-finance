import {
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  ChartLine,
  CircleParking,
  Coins,
  Dumbbell,
  Film,
  Flame,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartHandshake,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Plane,
  Popcorn,
  Receipt,
  Shirt,
  ShoppingCart,
  Stethoscope,
  TrendingDown,
  TrendingUp,
  Droplet,
  Utensils,
  Wifi,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { CategoryType } from "@/generated/prisma/enums";

/** Rótulo em pt-BR por tipo (docs/24-CATEGORIES.md, "Tipos de Categoria"). */
export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "Receita",
  [CategoryType.EXPENSE]: "Despesa",
};

/**
 * Ícone de fallback por tipo — usado quando a categoria não tem ícone
 * próprio (o seed padrão não atribui ícone/cor, ver `prisma/seed.ts`).
 * Direção da seta reforça a semântica financeira (docs/04-DESIGN_SYSTEM.md,
 * "Cores Financeiras").
 */
export const CATEGORY_TYPE_DEFAULT_ICON: Record<CategoryType, LucideIcon> = {
  [CategoryType.INCOME]: TrendingUp,
  [CategoryType.EXPENSE]: TrendingDown,
};

/** Cor de fallback por tipo — mesma semântica de "Cores Financeiras" (receita verde, despesa vermelho). */
export const CATEGORY_TYPE_DEFAULT_COLOR: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "#16A34A",
  [CategoryType.EXPENSE]: "#EF4444",
};

/**
 * Cor da bolinha ao lado do nome da categoria em listas (Dashboard,
 * Transações) — `color` próprio da categoria ou fallback por tipo (mesma
 * regra de `category-row.tsx`). `type` aqui é sempre `CategoryType` mesmo
 * vindo de uma `Transaction` (INCOME/EXPENSE são os únicos tipos que têm
 * categoria — TRANSFER/CARD_PAYMENT não).
 */
export function resolveCategoryDotColor(color: string | null | undefined, type: CategoryType): string {
  return color ?? CATEGORY_TYPE_DEFAULT_COLOR[type];
}

/**
 * Conjunto curado de ícones selecionáveis no formulário (`icon` guarda a
 * key). Cobre os grupos do seed padrão (docs/24-CATEGORIES.md, "Seed de
 * Categorias Padrão") — despesas e receitas.
 */
export const CATEGORY_ICON_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "utensils", label: "Alimentação", icon: Utensils },
  { value: "shopping-cart", label: "Mercado/Compras", icon: ShoppingCart },
  { value: "house", label: "Casa", icon: House },
  { value: "lightbulb", label: "Energia", icon: Lightbulb },
  { value: "droplet", label: "Água", icon: Droplet },
  { value: "flame", label: "Gás", icon: Flame },
  { value: "wifi", label: "Internet", icon: Wifi },
  { value: "phone", label: "Telefone", icon: Phone },
  { value: "building-2", label: "Condomínio/Empresa", icon: Building2 },
  { value: "wrench", label: "Manutenção", icon: Wrench },
  { value: "car", label: "Carro", icon: Car },
  { value: "fuel", label: "Combustível", icon: Fuel },
  { value: "bus", label: "Transporte público", icon: Bus },
  { value: "circle-parking", label: "Estacionamento", icon: CircleParking },
  { value: "heart-pulse", label: "Saúde", icon: HeartPulse },
  { value: "pill", label: "Farmácia", icon: Pill },
  { value: "stethoscope", label: "Consultas", icon: Stethoscope },
  { value: "dumbbell", label: "Academia", icon: Dumbbell },
  { value: "film", label: "Cinema/Shows", icon: Film },
  { value: "popcorn", label: "Lazer", icon: Popcorn },
  { value: "plane", label: "Viagens", icon: Plane },
  { value: "gamepad-2", label: "Hobbies", icon: Gamepad2 },
  { value: "graduation-cap", label: "Educação", icon: GraduationCap },
  { value: "book-open", label: "Livros/Cursos", icon: BookOpen },
  { value: "shirt", label: "Vestuário", icon: Shirt },
  { value: "laptop", label: "Eletrônicos", icon: Laptop },
  { value: "gift", label: "Presentes", icon: Gift },
  { value: "baby", label: "Filhos", icon: Baby },
  { value: "paw-print", label: "Pets", icon: PawPrint },
  { value: "landmark", label: "Banco/Tarifas", icon: Landmark },
  { value: "receipt", label: "Impostos", icon: Receipt },
  { value: "briefcase", label: "Salário/Freelance", icon: Briefcase },
  { value: "hand-coins", label: "Reembolso", icon: HandCoins },
  { value: "chart-line", label: "Rendimentos", icon: ChartLine },
  { value: "heart-handshake", label: "Doação", icon: HeartHandshake },
  { value: "piggy-bank", label: "Poupança/Investimento", icon: PiggyBank },
  { value: "coins", label: "Moedas", icon: Coins },
  { value: "banknote", label: "Dinheiro", icon: Banknote },
];

export const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map((option) => [option.value, option.icon]),
);

/**
 * Paleta fixa de cores do picker — mesma base de marca de `accounts` mais
 * algumas variações extras (as categorias EXPENSE têm até 9 grupos raiz no
 * seed, então vale ter mais tons pra diferenciar no gráfico de pizza).
 */
export const CATEGORY_COLOR_OPTIONS: string[] = [
  "#1E40AF",
  "#0EA5E9",
  "#16A34A",
  "#EA580C",
  "#7C3AED",
  "#F59E0B",
  "#EF4444",
  "#64748B",
  "#DB2777",
  "#0D9488",
  "#CA8A04",
  "#4338CA",
];
