import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton de cards de meta (docs/04-DESIGN_SYSTEM.md, "Loading": "Utilizar
 * Skeleton"). Next.js usa este arquivo automaticamente como fallback de
 * Suspense da rota enquanto o Server Component busca as metas, contas e
 * ativos — mesmo padrão de `(app)/budgets/loading.tsx`.
 */
export default function GoalsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[150px] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
