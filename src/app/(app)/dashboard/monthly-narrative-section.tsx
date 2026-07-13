import { insightsService } from "@/modules/insights/service";
import { nowInSaoPaulo } from "@/lib/date/timezone";
import { MonthlyNarrativeCard } from "@/components/dashboard/monthly-narrative-card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * "Resumo do mês" isolado do restante do Dashboard (`.claude/rules/01-server-components-data.md`,
 * R1/R2): `insightsService.monthlyNarrative` é IA best-effort (retorna `null`
 * em falha, pior caso ~128s com retry+fallback) — se ficasse no `Promise.all`
 * crítico da página, travava o skeleton inteiro atrás da resposta da IA. Este
 * Server Component tem seu próprio `await` e seu próprio `Suspense` no page.tsx:
 * lento/falho aqui degrada só este card, nunca o resto do Dashboard.
 */
export async function MonthlyNarrativeSection({ userId }: { userId: string }) {
  // "Resumo do mês" é sempre o mês CORRENTE, independente do filtro de período
  // do Dashboard (mesma regra de antes, agora isolada aqui).
  const now = nowInSaoPaulo();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const narrative = await insightsService.monthlyNarrative(userId, year, month);

  return <MonthlyNarrativeCard narrative={narrative} />;
}

/** Fallback do `Suspense` — mesma altura do slot do card na `DashboardSkeleton`. */
export function MonthlyNarrativeSkeleton() {
  return <Skeleton className="h-28 w-full rounded-xl" />;
}
