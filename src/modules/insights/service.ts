import { healthScore } from "./score";
import { monthlyNarrative } from "./narrative";

/**
 * Facade do módulo insights — único ponto de entrada pra Server Components
 * (docs/99-CLAUDE.md, "Regra de Ouro"). Sem `actions.ts`: as 2 funções são
 * leitura pura, chamadas direto de Server Components (sem mutation).
 */
export const insightsService = {
  healthScore,
  monthlyNarrative,
};
