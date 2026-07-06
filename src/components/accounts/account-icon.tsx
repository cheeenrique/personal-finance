import type { AccountType } from "@/generated/prisma/enums";
import { ACCOUNT_ICON_MAP, ACCOUNT_TYPE_ICONS } from "./account-config";

type AccountIconProps = {
  icon: string | null | undefined;
  type: AccountType;
  className?: string;
};

/**
 * Ícone de exibição da conta: ícone escolhido pelo usuário > fallback pelo
 * tipo. Componente próprio (em vez de uma função que devolve `LucideIcon`
 * para o chamador renderizar) — resolver e renderizar no mesmo componente
 * evita reatribuir uma referência de componente a uma variável local a cada
 * render do card/detalhe (`react-hooks/static-components`).
 */
export function AccountIcon({ icon, type, className }: AccountIconProps) {
  const Icon = (icon ? ACCOUNT_ICON_MAP[icon] : undefined) ?? ACCOUNT_TYPE_ICONS[type];
  return <Icon className={className} aria-hidden="true" />;
}
