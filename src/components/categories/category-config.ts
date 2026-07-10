import {
  Baby,
  Banknote,
  Beer,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  Cat,
  ChartLine,
  CircleParking,
  Coffee,
  Coins,
  Dog,
  Dumbbell,
  Film,
  Flame,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  Hammer,
  HandCoins,
  HeartHandshake,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  Luggage,
  Music,
  PawPrint,
  Phone,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Popcorn,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Sun,
  Tag,
  Ticket,
  Train,
  TreePine,
  TrendingDown,
  TrendingUp,
  Droplet,
  Umbrella,
  Utensils,
  UtensilsCrossed,
  Wifi,
  Wine,
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
  { value: "utensils-crossed", label: "Restaurante", icon: UtensilsCrossed },
  { value: "coffee", label: "Café", icon: Coffee },
  { value: "pizza", label: "Delivery", icon: Pizza },
  { value: "beer", label: "Bar", icon: Beer },
  { value: "wine", label: "Bebidas", icon: Wine },
  { value: "shopping-cart", label: "Mercado", icon: ShoppingCart },
  { value: "shopping-bag", label: "Compras", icon: ShoppingBag },
  { value: "house", label: "Casa", icon: House },
  { value: "lightbulb", label: "Energia", icon: Lightbulb },
  { value: "droplet", label: "Água", icon: Droplet },
  { value: "flame", label: "Gás", icon: Flame },
  { value: "wifi", label: "Internet", icon: Wifi },
  { value: "phone", label: "Telefone", icon: Phone },
  { value: "smartphone", label: "Celular/Assinaturas", icon: Smartphone },
  { value: "building-2", label: "Condomínio/Empresa", icon: Building2 },
  { value: "wrench", label: "Manutenção", icon: Wrench },
  { value: "hammer", label: "Reforma", icon: Hammer },
  { value: "car", label: "Carro", icon: Car },
  { value: "fuel", label: "Combustível", icon: Fuel },
  { value: "bus", label: "Transporte público", icon: Bus },
  { value: "train", label: "Metrô/Trem", icon: Train },
  { value: "bike", label: "Bicicleta", icon: Bike },
  { value: "circle-parking", label: "Estacionamento", icon: CircleParking },
  { value: "heart-pulse", label: "Saúde", icon: HeartPulse },
  { value: "pill", label: "Farmácia", icon: Pill },
  { value: "stethoscope", label: "Consultas", icon: Stethoscope },
  { value: "dumbbell", label: "Academia", icon: Dumbbell },
  { value: "film", label: "Cinema/Shows", icon: Film },
  { value: "popcorn", label: "Lazer", icon: Popcorn },
  { value: "music", label: "Streaming/Música", icon: Music },
  { value: "ticket", label: "Ingressos", icon: Ticket },
  { value: "plane", label: "Viagens", icon: Plane },
  { value: "luggage", label: "Bagagem", icon: Luggage },
  { value: "sun", label: "Praia/Verão", icon: Sun },
  { value: "gamepad-2", label: "Hobbies", icon: Gamepad2 },
  { value: "graduation-cap", label: "Educação", icon: GraduationCap },
  { value: "book-open", label: "Livros/Cursos", icon: BookOpen },
  { value: "shirt", label: "Vestuário", icon: Shirt },
  { value: "scissors", label: "Salão/Beleza", icon: Scissors },
  { value: "sparkles", label: "Estética", icon: Sparkles },
  { value: "laptop", label: "Eletrônicos", icon: Laptop },
  { value: "gift", label: "Presentes", icon: Gift },
  { value: "baby", label: "Filhos", icon: Baby },
  { value: "paw-print", label: "Pets", icon: PawPrint },
  { value: "dog", label: "Cachorro", icon: Dog },
  { value: "cat", label: "Gato", icon: Cat },
  { value: "tree-pine", label: "Jardim", icon: TreePine },
  { value: "landmark", label: "Banco/Tarifas", icon: Landmark },
  { value: "receipt", label: "Impostos", icon: Receipt },
  { value: "briefcase", label: "Salário/Freelance", icon: Briefcase },
  { value: "hand-coins", label: "Reembolso", icon: HandCoins },
  { value: "chart-line", label: "Rendimentos", icon: ChartLine },
  { value: "heart-handshake", label: "Doação", icon: HeartHandshake },
  { value: "umbrella", label: "Seguro", icon: Umbrella },
  { value: "tag", label: "Promoções/Descontos", icon: Tag },
  { value: "gem", label: "Joias/Luxo", icon: Gem },
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
  // Extras genéricos — mesma paleta oferecida em Cartões
  // (`card-color.ts`), pra mais opções de diferenciação no gráfico de pizza.
  "#3B4252",
  "#1E293B",
  "#E0A9A0",
  "#14B8A6",
  "#6366F1",
  "#EC4899",
];
