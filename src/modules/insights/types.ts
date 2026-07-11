/**
 * Tipos do módulo insights — score de saúde financeira (`score.ts`), tendência
 * de categorias (`trends.ts`) e narrativa mensal via IA (`narrative.ts`).
 * Sem persistência própria (tudo derivado on-demand de outros módulos), ver
 * docs/99-CLAUDE.md "Regra de Ouro".
 */

/** Faixa de leitura do score — mesma semântica em toda a UI (badge verde/amarelo/vermelho). */
export type ScoreTone = "success" | "warning" | "danger";

/**
 * Uma das três métricas que compõem o score (docs internos da task): `value`
 * é o número bruto (ex.: taxa de poupança em %, meses de reserva), `score` é
 * a nota 0-100 já mapeada por `score.ts` `linearScore`.
 */
export type ScoreBreakdown = {
  key: "savings" | "debt" | "cushion";
  label: string;
  value: number;
  score: number;
  tone: ScoreTone;
};

/** Score de saúde financeira 0-100 — média ponderada das 3 métricas de `breakdown`. */
export type HealthScore = {
  score: number;
  tone: ScoreTone;
  breakdown: ScoreBreakdown[];
};

/**
 * Categoria com gasto do mês atual vs. média móvel dos meses anteriores
 * (`trends.ts` `categoryTrends`). `current`/`avgPrevious` já convertidos de
 * `Prisma.Decimal` para `number` — este módulo só lê e resume, não soma
 * dinheiro (regra de precisão fica nos módulos de origem, `reports`).
 */
export type CategoryTrend = {
  categoryId: string;
  categoryName: string;
  current: number;
  avgPrevious: number;
  deltaPct: number;
  rising: boolean;
};

/** Categorias com gasto subindo (`rising=true`), ordenadas por `deltaPct` desc. */
export type TrendsResult = {
  rising: CategoryTrend[];
  window: number;
};

/**
 * Resumo factual do mês gerado por IA (`narrative.ts` `monthlyNarrative`) —
 * `null` quando a extração falhou (erro-como-dado, nunca lança; caller mostra
 * estado vazio, ver ~/.claude/rules/06-composition-errors.md).
 */
export type MonthlyNarrative = { resumo: string; destaques: string[]; month: number; year: number } | null;
