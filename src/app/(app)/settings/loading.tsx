import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton dos cards de seção (docs/12-SETTINGS.md, "Estados" > "Loading").
 * Next.js usa este arquivo automaticamente como fallback de Suspense da
 * rota enquanto o Server Component busca `UserSettings`.
 */
export default function SettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[220px] rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-[160px] w-full rounded-xl" />
      <Skeleton className="h-[120px] w-full rounded-xl" />
    </div>
  );
}
