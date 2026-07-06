import { Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { Prisma } from "@/generated/prisma/client";
import { accountService } from "@/modules/accounts/service";
import { KPICard } from "@/components/shared/kpi-card";
import { AccountGrid } from "@/components/accounts/account-grid";
import type { AccountCardData } from "@/components/accounts/types";
import { formatBRL } from "@/lib/money/format";

/**
 * `/accounts` (docs/21-ACCOUNTS.md). Server Component: lê saldo derivado via
 * `accountService.listWithBalances` direto (sem passar por Server Action —
 * Server Actions aqui são só para mutations disparadas pelo client, ver
 * docs/99-CLAUDE.md "Regra de Ouro"). `Prisma.Decimal` é convertido pra
 * string na borda antes de descer pra Client Components (RSC não serializa
 * instância de classe).
 */
export default async function AccountsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const accountsWithBalance = await accountService.listWithBalances(userId);

  const accounts: AccountCardData[] = accountsWithBalance.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance.toString(),
    initialBalance: account.initialBalance.toString(),
    color: account.color,
    icon: account.icon,
    isActive: account.isActive,
  }));

  // Soma dos saldos já buscados acima — mesma fonte de dado que
  // `accountService.totalBalance` usaria, sem repetir a query
  // (`listWithBalances` já inclui todos os tipos ativos, OTHER incluso).
  const totalBalance = accountsWithBalance.reduce(
    (sum, account) => sum.plus(account.balance),
    new Prisma.Decimal(0),
  );

  return (
    <div className="flex flex-col gap-6">
      <KPICard
        icon={Wallet}
        title="Saldo Total"
        value={formatBRL(totalBalance.toString())}
        tone={totalBalance.isNegative() ? "danger" : "success"}
        className="max-w-sm"
      />

      <AccountGrid accounts={accounts} />
    </div>
  );
}
