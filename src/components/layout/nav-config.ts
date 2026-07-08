import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  Layers3,
  HandCoins,
  Building2,
  PiggyBank,
  Landmark,
  FolderTree,
  Tag,
  BarChart3,
  Bell,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * Fonte única de verdade da navegação — reusada por Sidebar, Header (mapa de
 * título/descrição por rota) e BottomNav/Drawer mobile (docs/06-SCREENS.md,
 * "Header" e "Sidebar": "mantido num só lugar, não hardcoded em cada tela").
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export type NavSection = {
  id: string;
  title: string;
  items: NavItem[];
};

/** Agrupamento da navegação por seção — ordem e rótulos aprovados no design da Sidebar. */
export const NAV_SECTIONS: NavSection[] = [
  {
    id: "overview",
    title: "Visão Geral",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Sua vida financeira agora",
      },
      {
        label: "Relatórios",
        href: "/reports",
        icon: BarChart3,
        description: "Análise profunda e comparação de tendências",
      },
    ],
  },
  {
    id: "movements",
    title: "Movimentações",
    items: [
      {
        label: "Transações",
        href: "/transactions",
        icon: ArrowLeftRight,
        description: "Todas as suas movimentações financeiras",
      },
      {
        label: "Contas",
        href: "/accounts",
        icon: Wallet,
        description: "Saldo disponível e transferências entre contas",
      },
      {
        label: "Cartões",
        href: "/cards",
        icon: CreditCard,
        description: "Limite, fatura e compras dos seus cartões",
      },
    ],
  },
  {
    id: "credit-debts",
    title: "Crédito & Dívidas",
    items: [
      {
        label: "Parcelamentos",
        href: "/installments",
        icon: Layers3,
        description: "Compras parceladas em progresso",
      },
      {
        label: "Empréstimos",
        href: "/loans",
        icon: HandCoins,
        description: "Parcelas e saldo devedor dos seus empréstimos",
      },
      {
        label: "Financiamentos",
        href: "/financings",
        icon: Building2,
        description: "Parcelas e saldo devedor dos seus financiamentos",
      },
    ],
  },
  {
    id: "planning",
    title: "Planejamento",
    items: [
      {
        label: "Orçamentos",
        href: "/budgets",
        icon: PiggyBank,
        description: "Planejado vs. realizado por categoria",
      },
      {
        label: "Patrimônio",
        href: "/assets",
        icon: Landmark,
        description: "Bens e investimentos ao longo do tempo",
      },
    ],
  },
  {
    id: "organization",
    title: "Organização",
    items: [
      {
        label: "Categorias",
        href: "/categories",
        icon: FolderTree,
        description: "Estrutura de categorias usada nas transações",
      },
      {
        label: "Tags",
        href: "/tags",
        icon: Tag,
        description: "Marcadores livres para contextualizar transações",
      },
    ],
  },
  {
    id: "system",
    title: "Sistema",
    items: [
      {
        label: "Alertas",
        href: "/alerts",
        icon: Bell,
        description: "Histórico completo de alertas gerados",
      },
      {
        label: "Configurações",
        href: "/settings",
        icon: Settings,
        description: "Preferências, alertas, Telegram e dados",
      },
    ],
  },
];

/** Lista flat, derivada de `NAV_SECTIONS` (DRY) — consumida onde a divisão em seções não importa (Command Palette, lookup por rota). */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Rotas fixadas na Bottom Navigation (mobile) — os 3 itens mais usados + [+] + Menu. */
const BOTTOM_NAV_HREFS = ["/dashboard", "/transactions", "/cards"];

/** Itens visíveis na Bottom Navigation (mobile). Busca por `href` (não índice) porque `NAV_ITEMS` reflete a ordem agrupada por seção. */
export const BOTTOM_NAV_ITEMS: NavItem[] = BOTTOM_NAV_HREFS.map((href) => {
  const item = NAV_ITEMS.find((navItem) => navItem.href === href);
  if (!item) throw new Error(`nav-config: item de Bottom Nav não encontrado para "${href}"`);
  return item;
});

/** Restante da navegação por seção, exibido no Drawer "Menu" do mobile — mesmo agrupamento da Sidebar, sem os itens já fixados na Bottom Nav. */
export const DRAWER_NAV_SECTIONS: NavSection[] = NAV_SECTIONS.map((section) => ({
  ...section,
  items: section.items.filter((item) => !BOTTOM_NAV_ITEMS.includes(item)),
})).filter((section) => section.items.length > 0);

export function findNavItemByPathname(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );
}
