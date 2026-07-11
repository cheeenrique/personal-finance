import type { GoalSourceType } from "@/generated/prisma/enums";

/**
 * Forma serializável de `GoalProgress` (@/modules/goals/types) para cruzar a
 * fronteira Server → Client Component. `Prisma.Decimal`/`Date` não são
 * serializáveis por RSC — o Server Component converte pra string na borda
 * (docs/03-DATABASE.md: "Parse/format só na borda"), mesmo padrão de
 * `components/budgets/types.ts`.
 *
 * `current`/`target`/`pct`/`etaMonths` já vêm calculados do
 * `goalService.listWithProgress` — o card nunca recalcula progresso (regra de
 * ouro, docs/99-CLAUDE.md: lógica de negócio só em `modules/`).
 */
export type GoalCardData = {
  id: string;
  name: string;
  /** Decimal(12,2) como string — nunca float. */
  targetAmount: string;
  /** `YYYY-MM-DD` (America/Sao_Paulo) ou `null` quando a meta não tem prazo. */
  targetDate: string | null;
  sourceType: GoalSourceType;
  sourceAccountId: string | null;
  sourceAssetId: string | null;
  /** Valor MANUAL gravado — só relevante para reidratar o form em edição (ACCOUNT/ASSET derivam `current` de outra fonte). */
  currentAmount: string;
  monthlyContribution: string | null;
  current: number;
  target: number;
  /** Percentual atingido, 0-100. */
  pct: number;
  /** Meses estimados até bater a meta no ritmo atual — `null` = ritmo insuficiente/zero, `0` = meta já completa. */
  etaMonths: number | null;
};
