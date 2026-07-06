import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton da árvore de categorias (docs/24-CATEGORIES.md, "Estados").
 * Next.js usa este arquivo automaticamente como fallback de Suspense da
 * rota enquanto o Server Component busca a árvore.
 */
export default function CategoriesLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-8 w-[220px] rounded-lg" />
      <div className="flex flex-col gap-2 rounded-xl border border-border p-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
