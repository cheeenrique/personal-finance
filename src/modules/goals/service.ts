import { differenceInCalendarMonths, subMonths } from "date-fns";
import { Prisma, type SavingsGoal } from "@/generated/prisma/client";
import { GoalSourceType } from "@/generated/prisma/enums";
import { accountService } from "@/modules/accounts/service";
import { assetService } from "@/modules/assets/service";
import { reportService } from "@/modules/reports/service";
import { goalRepository, type CreateGoalData, type UpdateGoalData } from "./repository";
import {
  GoalNotFoundError,
  GoalInvalidSourceError,
  GoalSourceAccountNotFoundError,
  GoalSourceAssetNotFoundError,
} from "./errors";
import type { GoalProgress } from "./types";

/**
 * Regra de consistência `sourceType` x `sourceAccountId`/`sourceAssetId` —
 * MESMA checagem já feita no zod (`schemas.ts` `createGoalSchema`
 * `superRefine`), reforçada aqui pro caso do service ser chamado direto (ex.:
 * seed, script), sem passar pela Server Action, e pro `updateGoal` (que
 * precisa validar contra o estado MESCLADO, não só o patch — ver seu JSDoc).
 */
function assertValidSource(
  sourceType: GoalSourceType,
  sourceAccountId?: string | null,
  sourceAssetId?: string | null,
): void {
  if (sourceType === GoalSourceType.ACCOUNT && !sourceAccountId) {
    throw new GoalInvalidSourceError("Meta com origem ACCOUNT exige sourceAccountId", { sourceType });
  }
  if (sourceType === GoalSourceType.ASSET && !sourceAssetId) {
    throw new GoalInvalidSourceError("Meta com origem ASSET exige sourceAssetId", { sourceType });
  }
  if (sourceType === GoalSourceType.MANUAL && (sourceAccountId || sourceAssetId)) {
    throw new GoalInvalidSourceError("Meta MANUAL não pode ter sourceAccountId/sourceAssetId", { sourceType });
  }
}

/**
 * Ownership do Account/Asset vinculado — nunca confiar no id sem checar dono
 * (docs/10-AUTH.md, "Regra Principal de Segurança"), mesma cautela de
 * `budgets/service.ts` `assertBudgetableCategory`.
 */
async function assertSourceOwnership(
  userId: string,
  sourceType: GoalSourceType,
  sourceAccountId?: string | null,
  sourceAssetId?: string | null,
): Promise<void> {
  if (sourceType === GoalSourceType.ACCOUNT && sourceAccountId) {
    const exists = await goalRepository.accountExists(userId, sourceAccountId);
    if (!exists) throw new GoalSourceAccountNotFoundError(sourceAccountId);
  }
  if (sourceType === GoalSourceType.ASSET && sourceAssetId) {
    const exists = await goalRepository.assetExists(userId, sourceAssetId);
    if (!exists) throw new GoalSourceAssetNotFoundError(sourceAssetId);
  }
}

async function listGoals(userId: string): Promise<SavingsGoal[]> {
  return goalRepository.list(userId);
}

async function getGoal(userId: string, id: string): Promise<SavingsGoal> {
  const goal = await goalRepository.findById(userId, id);
  if (!goal) throw new GoalNotFoundError(id);
  return goal;
}

async function createGoal(userId: string, input: CreateGoalData): Promise<SavingsGoal> {
  assertValidSource(input.sourceType, input.sourceAccountId, input.sourceAssetId);
  await assertSourceOwnership(userId, input.sourceType, input.sourceAccountId, input.sourceAssetId);

  return goalRepository.create(userId, input);
}

/**
 * Valida a consistência `sourceType`/`sourceAccountId`/`sourceAssetId`
 * contra o estado MESCLADO (existente + patch) — um update parcial que só
 * manda `sourceAccountId` (mantendo `sourceType=ACCOUNT` implícito) não pode
 * escapar da checagem, e um update que muda só `sourceType` pra MANUAL
 * precisa continuar vendo o `sourceAccountId` antigo pra rejeitar a
 * combinação inconsistente.
 */
async function updateGoal(userId: string, id: string, input: UpdateGoalData): Promise<SavingsGoal> {
  const existing = await goalRepository.findById(userId, id);
  if (!existing) throw new GoalNotFoundError(id);

  const mergedSourceType = input.sourceType ?? existing.sourceType;
  const mergedSourceAccountId = input.sourceAccountId !== undefined ? input.sourceAccountId : existing.sourceAccountId;
  const mergedSourceAssetId = input.sourceAssetId !== undefined ? input.sourceAssetId : existing.sourceAssetId;

  assertValidSource(mergedSourceType, mergedSourceAccountId, mergedSourceAssetId);
  await assertSourceOwnership(userId, mergedSourceType, mergedSourceAccountId, mergedSourceAssetId);

  const updated = await goalRepository.update(userId, id, input);
  if (!updated) throw new GoalNotFoundError(id);
  return updated;
}

/** Soft delete (mesma convenção de accounts/budgets/tags) — não bloqueia por nenhuma outra entidade (meta é só leitura sobre conta/ativo). */
async function deleteGoal(userId: string, id: string): Promise<void> {
  const deleted = await goalRepository.softDelete(userId, id);
  if (!deleted) throw new GoalNotFoundError(id);
}

/**
 * Meses (inteiro, mínimo 1) de `refDate` até `targetDate` — insumo de
 * `requiredMonthly`. Nunca 0/negativo: prazo já vencido ou dentro do mês
 * corrente ainda precisa de UM aporte pra fechar a conta, não faz sentido
 * dividir por zero/negativo.
 */
function monthsUntil(refDate: Date, targetDate: Date): number {
  return Math.max(differenceInCalendarMonths(targetDate, refDate), 1);
}

/**
 * Ritmo de poupança dos últimos 3 meses (`reportService.cashflow`, MESMA base
 * de caixa do resto do app) — usado como aporte mensal IMPLÍCITO quando a
 * meta não tem `monthlyContribution` configurado (ou configurado <= 0). Só
 * conta se POSITIVO: líquido negativo nos últimos 3 meses não vira "aporte
 * negativo" — cai pra `0`, que `computeEtaMonths` já lê como "sem ETA
 * calculável".
 */
async function trailingMonthlyRate(userId: string, refDate: Date): Promise<number> {
  const dateFrom = subMonths(refDate, 3);
  const { net } = await reportService.cashflow(userId, dateFrom, refDate);
  const rate = net.dividedBy(3).toNumber();
  return rate > 0 ? rate : 0;
}

/** Meses (arredondado pra cima) até atingir `remaining` no ritmo `rate` — `null` se `rate<=0` (sem ETA calculável). */
function computeEtaMonths(remaining: number, rate: number): number | null {
  if (rate <= 0) return null;
  return Math.ceil(remaining / rate);
}

/** `current` de uma meta conforme `sourceType` — ver JSDoc de `listWithProgress`. */
function deriveCurrentAmount(
  goal: SavingsGoal,
  balanceByAccountId: Map<string, Prisma.Decimal>,
  valueByAssetId: Map<string, Prisma.Decimal>,
): number {
  switch (goal.sourceType) {
    case GoalSourceType.ACCOUNT:
      return (goal.sourceAccountId ? balanceByAccountId.get(goal.sourceAccountId) : undefined)?.toNumber() ?? 0;
    case GoalSourceType.ASSET:
      return (goal.sourceAssetId ? valueByAssetId.get(goal.sourceAssetId) : undefined)?.toNumber() ?? 0;
    case GoalSourceType.MANUAL:
    default:
      return goal.currentAmount.toNumber();
  }
}

/** Progresso de UMA meta já com `current`/`trailingRate` resolvidos — extraído de `listWithProgress` pra manter a função principal enxuta (rule 05-naming-size.md). */
function buildProgress(goal: SavingsGoal, current: number, trailingRate: number, refDate: Date): GoalProgress {
  const target = goal.targetAmount.toNumber();
  const remaining = target - current;

  if (remaining <= 0) {
    return { goal, current, target, pct: 100, etaMonths: 0, requiredMonthly: 0 };
  }

  const rate =
    goal.monthlyContribution && goal.monthlyContribution.greaterThan(0)
      ? goal.monthlyContribution.toNumber()
      : trailingRate;

  const pct = target > 0 ? Math.max(Number(((current / target) * 100).toFixed(2)), 0) : 0;
  const etaMonths = computeEtaMonths(remaining, rate);
  const requiredMonthly = goal.targetDate
    ? Number(Math.max(remaining / monthsUntil(refDate, goal.targetDate), 0).toFixed(2))
    : null;

  return { goal, current, target, pct, etaMonths, requiredMonthly };
}

/**
 * Progresso de TODAS as metas do usuário — deriva `current` conforme
 * `sourceType` (MANUAL: `currentAmount` gravado; ACCOUNT: saldo da conta
 * linkada, MESMO cálculo do resto do app via `accountService.listWithBalances`;
 * ASSET: `currentValue` do ativo linkado via `assetService.list`), sem N+1:
 * 1 query de goals + 1 de contas/saldo + 1 de assets + (no máximo) 1 de
 * cashflow (ritmo de poupança trailing, computado 1x e reaproveitado por
 * TODAS as metas sem `monthlyContribution` configurado — mesmo padrão de
 * `budgets/service.ts` `listWithProgress`, que também resolve os insumos
 * compartilhados 1x fora do loop de metas).
 */
async function listWithProgress(userId: string): Promise<GoalProgress[]> {
  const goals = await goalRepository.list(userId);
  if (goals.length === 0) return [];

  const refDate = new Date();
  const needsTrailingRate = goals.some(
    (goal) => !goal.monthlyContribution || goal.monthlyContribution.lessThanOrEqualTo(0),
  );

  const [accounts, assets, trailingRate] = await Promise.all([
    accountService.listWithBalances(userId),
    assetService.list(userId),
    needsTrailingRate ? trailingMonthlyRate(userId, refDate) : Promise.resolve(0),
  ]);

  const balanceByAccountId = new Map(accounts.map((account) => [account.id, account.balance]));
  const valueByAssetId = new Map(assets.map((asset) => [asset.id, asset.currentValue]));

  return goals.map((goal) => {
    const current = deriveCurrentAmount(goal, balanceByAccountId, valueByAssetId);
    return buildProgress(goal, current, trailingRate, refDate);
  });
}

export const goalService = {
  listGoals,
  getGoal,
  createGoal,
  updateGoal,
  deleteGoal,
  listWithProgress,
};
