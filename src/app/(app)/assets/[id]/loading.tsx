import { Skeleton } from "@/components/ui/skeleton";

export default function AssetDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-5 w-20" />
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-[13px]" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Skeleton className="h-[160px] rounded-xl" />
        <Skeleton className="h-[160px] rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
