import { Prisma } from "@/generated/prisma/client";
import type { ProjectYieldInput } from "./schemas";
import type { YieldProjection } from "./types";

/**
 * Projeção estimada a juros simples (docs/28-INVESTMENTS.md):
 * yield = principal * (cdi/100) * (percent/100) * (days/365)
 * Sempre rotular como estimativa na UI — não atualiza patrimônio.
 */
export function projectYield(input: ProjectYieldInput): YieldProjection {
  const principal = new Prisma.Decimal(input.principal);
  const cdi = new Prisma.Decimal(input.cdiAnnualRatePercent);
  const percent = new Prisma.Decimal(input.yieldPercentOfBenchmark);
  const days = new Prisma.Decimal(input.days);

  const effectiveAnnual = cdi.mul(percent).div(100);
  const yieldAmount = principal.mul(cdi).div(100).mul(percent).div(100).mul(days).div(365);
  const projectedValue = principal.plus(yieldAmount);

  return {
    principal: principal.toFixed(2),
    yieldAmount: yieldAmount.toFixed(2),
    projectedValue: projectedValue.toFixed(2),
    effectiveAnnualRatePercent: effectiveAnnual.toFixed(4),
    days: input.days,
    cdiAnnualRatePercent: cdi.toFixed(4),
    yieldPercentOfBenchmark: percent.toFixed(2),
  };
}
