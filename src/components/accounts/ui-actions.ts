"use server";

import { listAccountsAction } from "@/modules/accounts/actions";
import type { ActionResult } from "@/modules/accounts/types";
import type { AccountCardData } from "./types";

/**
 * Adaptador de fronteira client/server — mesma razão de
 * `components/cards/ui-actions.ts`: `listAccountsAction` retorna
 * `Prisma.Decimal` (`balance`/`initialBalance`), que React Flight não
 * serializa de volta pro Client Component que a invoca. Mesma conversão já
 * feita no Server Component de `app/(app)/accounts/page.tsx`, só que aqui
 * como Server Action — usado pela ação rápida "Transferência" do Dashboard
 * (`dashboard/quick-actions.tsx`), que abre o `TransferModal` fora da página
 * `/accounts` e precisa da lista de contas pra popular os selects.
 */
export async function listAccountsForTransferClient(): Promise<
  ActionResult<AccountCardData[]>
> {
  const result = await listAccountsAction();
  if (!result.success) return result;

  return {
    success: true,
    data: result.data.map((account) => ({
      id: account.id,
      name: account.name,
      type: account.type,
      balance: account.balance.toString(),
      initialBalance: account.initialBalance.toString(),
      color: account.color,
      icon: account.icon,
      isActive: account.isActive,
    })),
  };
}
