import type { BudgetStatus } from "@/modules/budgets/types";

/**
 * Forma serializável de `BudgetWithProgress` (@/modules/budgets/types) para
 * cruzar a fronteira Server → Client Component. `Prisma.Decimal` não é
 * serializável por RSC — o Server Component converte pra string na borda
 * (docs/03-DATABASE.md: "Parse/format só na borda"), mesmo padrão de
 * `components/accounts/types.ts`.
 *
 * `categoryName` é resolvido no Server Component (join com
 * `categoryService.listTree`, ver `(app)/budgets/page.tsx`) — o card não
 * carrega a árvore inteira só para exibir um nome.
 *
 * `remainingAmount` é `plannedAmount - spentAmount` já calculado com
 * `Prisma.Decimal` no Server Component (nunca subtração de `number` na UI,
 * ver `lib/money/format.ts`: "cálculo deve acontecer antes, com Decimal").
 */
export type BudgetCardData = {
  id: string;
  categoryId: string;
  categoryName: string;
  month: number;
  year: number;
  /** Decimal(12,2) como string — nunca float. */
  plannedAmount: string;
  spentAmount: string;
  remainingAmount: string;
  /** Percentual gasto/planejado, 0-∞ (pode passar de 100 quando estourado). */
  progress: number;
  status: BudgetStatus;
};
