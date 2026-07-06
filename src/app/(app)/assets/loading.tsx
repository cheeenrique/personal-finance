import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton de KPI + gráficos + cards (docs/27-ASSETS.md, "Estados" > "Loading").
 * Next.js usa este arquivo automaticamente como fallback de Suspense da rota
 * enquanto o Server Component busca os dados.
 */
export default function AssetsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-[160px] w-full max-w-sm rounded-xl" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[160px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
