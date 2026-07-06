import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton de cards (docs/26-BUDGETS.md, "Estados" > "Loading"). Next.js usa
 * este arquivo automaticamente como fallback de Suspense da rota enquanto o
 * Server Component busca os orçamentos do período.
 */
export default function BudgetsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-8 w-40" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[150px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
