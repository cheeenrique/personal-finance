import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet } from "lucide-react";

import { auth } from "@/lib/auth";
import { accountService } from "@/modules/accounts/service";
import { formatBRL } from "@/lib/money/format";
import { KPICard } from "@/components/shared/kpi-card";
import { AccountTransactionsHistory } from "@/components/accounts/account-transactions-history";
import { ACCOUNT_TYPE_LABELS, DEFAULT_ACCOUNT_COLOR } from "@/components/accounts/account-config";
import { AccountIcon } from "@/components/accounts/account-icon";
import { ImportButton } from "@/components/accounts/import-button";

/**
 * Detalhe da conta (docs/21-ACCOUNTS.md, "Detalhe da Conta"): saldo atual,
 * saldo inicial, histórico de transações (mesma `DataTable`/colunas/ações de
 * `/transactions`, ver `AccountTransactionsHistory`) com filtro de período
 * (mês atual/passado/personalizado). Filtros por categoria/tipo/tag/valor e
 * gráfico de entradas/saídas do mês ficam de fora desta versão — sinalizado
 * em "Improvement Suggestions" no resumo final, não é stub vazio (a tela já
 * entrega saldo + histórico real e interativo).
 */
export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const accounts = await accountService.listWithBalances(userId);
  const account = accounts.find((item) => item.id === id);
  if (!account) notFound();

  const color = account.color ?? DEFAULT_ACCOUNT_COLOR;
  const isNegative = account.balance.isNegative();

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/accounts"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Contas
      </Link>

      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-[13px]"
          style={{ backgroundColor: `${color}29`, color }}
        >
          <AccountIcon icon={account.icon} type={account.type} className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-extrabold text-foreground">{account.name}</h2>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {ACCOUNT_TYPE_LABELS[account.type]}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KPICard
          icon={Wallet}
          title="Saldo atual"
          value={formatBRL(account.balance.toString())}
          tone={isNegative ? "danger" : "success"}
        />
        <KPICard
          icon={Wallet}
          title="Saldo inicial"
          value={formatBRL(account.initialBalance.toString())}
          tone="neutral"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold text-foreground">Histórico de transações</h3>
          <ImportButton accountId={account.id} />
        </div>
        <AccountTransactionsHistory accountId={account.id} />
      </div>
    </div>
  );
}
