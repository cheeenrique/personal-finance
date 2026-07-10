import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { accountService } from "@/modules/accounts/service";
import { AccountOverview } from "@/components/accounts/account-overview";
import { AccountHeaderActions } from "@/components/accounts/account-header-actions";
import { ACCOUNT_TYPE_LABELS, DEFAULT_ACCOUNT_COLOR } from "@/components/accounts/account-config";
import { AccountIcon } from "@/components/accounts/account-icon";
import type { AccountCardData } from "@/components/accounts/types";

/**
 * Detalhe da conta (docs/21-ACCOUNTS.md, "Detalhe da Conta"; handoff "Conta
 * (Detalhe)"): cabeçalho (identidade + ações) + KPIs + filtros ricos + resumo
 * de fluxo do período + histórico de transações. Server Component fino — só
 * busca `accounts`/`account` e repassa pros Client Components
 * (`AccountHeaderActions`, `AccountOverview`) que possuem o estado
 * interativo (docs/99-CLAUDE.md, "Regra de Ouro").
 */
export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const accountsWithBalance = await accountService.listWithBalances(userId);
  const account = accountsWithBalance.find((item) => item.id === id);
  if (!account) notFound();

  const accounts: AccountCardData[] = accountsWithBalance.map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    balance: item.balance.toString(),
    initialBalance: item.initialBalance.toString(),
    color: item.color,
    icon: item.icon,
    isActive: item.isActive,
  }));

  const color = account.color ?? DEFAULT_ACCOUNT_COLOR;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/accounts"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contas
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{ backgroundColor: `${color}29`, color }}
          >
            <AccountIcon icon={account.icon} type={account.type} className="size-[22px]" />
          </span>
          <div>
            <h2 className="text-[22px] font-black tracking-[-0.02em] text-foreground">{account.name}</h2>
            <p className="mt-0.5 text-[13px] font-semibold text-muted-foreground">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </p>
          </div>
        </div>

        <AccountHeaderActions accountId={account.id} accounts={accounts} />
      </div>

      <AccountOverview
        accountId={account.id}
        balance={account.balance.toString()}
        initialBalance={account.initialBalance.toString()}
      />
    </div>
  );
}
