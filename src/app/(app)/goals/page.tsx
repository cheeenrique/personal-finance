import { auth } from "@/lib/auth";
import { goalService } from "@/modules/goals/service";
import { accountService } from "@/modules/accounts/service";
import { assetService } from "@/modules/assets/service";
import { toDateInputValueSaoPaulo } from "@/lib/date/format";
import type { EntitySelectOption } from "@/components/forms/entity-select";
import { GoalGrid } from "@/components/goals/goal-grid";
import type { GoalCardData } from "@/components/goals/types";

/**
 * `/goals`: metas de poupança com progresso derivado. Server Component lê
 * `goalService.listWithProgress` direto (sem passar pela Server Action —
 * Server Actions existem para mutations disparadas pelo client,
 * docs/99-CLAUDE.md "Regra de Ouro"), mesma decisão de
 * `(app)/budgets/page.tsx`. Contas e ativos são buscados aqui só para
 * alimentar os selects de origem (`sourceAccountId`/`sourceAssetId`) do form
 * de criar/editar meta.
 */
export default async function GoalsPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [goalsWithProgress, accounts, assets] = await Promise.all([
    goalService.listWithProgress(userId),
    accountService.listWithBalances(userId),
    assetService.list(userId),
  ]);

  const goals: GoalCardData[] = goalsWithProgress.map(({ goal, current, target, pct, etaMonths }) => ({
    id: goal.id,
    name: goal.name,
    targetAmount: goal.targetAmount.toString(),
    targetDate: goal.targetDate ? toDateInputValueSaoPaulo(goal.targetDate) : null,
    sourceType: goal.sourceType,
    sourceAccountId: goal.sourceAccountId,
    sourceAssetId: goal.sourceAssetId,
    currentAmount: goal.currentAmount.toString(),
    monthlyContribution: goal.monthlyContribution?.toString() ?? null,
    current,
    target,
    pct,
    etaMonths,
  }));

  const accountOptions: EntitySelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: account.name,
  }));
  const assetOptions: EntitySelectOption[] = assets.map((asset) => ({ value: asset.id, label: asset.name }));

  return <GoalGrid goals={goals} accountOptions={accountOptions} assetOptions={assetOptions} />;
}
