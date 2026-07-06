import type { CategoryType } from "@/modules/categories/types";
import { CATEGORY_ICON_MAP, CATEGORY_TYPE_DEFAULT_ICON } from "./category-config";

type CategoryIconProps = {
  icon: string | null | undefined;
  type: CategoryType;
  className?: string;
};

/**
 * Ícone de exibição da categoria: ícone escolhido pelo usuário > fallback
 * pelo tipo (o seed padrão não atribui ícone, ver `prisma/seed.ts`).
 * Componente próprio — resolver e renderizar no mesmo componente evita
 * reatribuir uma referência de componente a uma variável local a cada
 * render (`react-hooks/static-components`), mesmo padrão de
 * `components/accounts/account-icon.tsx`.
 */
export function CategoryIcon({ icon, type, className }: CategoryIconProps) {
  const Icon = (icon ? CATEGORY_ICON_MAP[icon] : undefined) ?? CATEGORY_TYPE_DEFAULT_ICON[type];
  return <Icon className={className} aria-hidden="true" />;
}
