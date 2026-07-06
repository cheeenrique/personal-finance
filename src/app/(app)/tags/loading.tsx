import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton de chips (docs/06-SCREENS.md, "Tags" > "Estados" > "Loading").
 * Next.js usa este arquivo automaticamente como fallback de Suspense da
 * rota enquanto o Server Component busca as tags.
 */
export default function TagsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-8 w-full sm:max-w-xs" />
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-full" />
        ))}
      </div>
    </div>
  );
}
