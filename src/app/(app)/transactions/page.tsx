import { Suspense } from "react";

import { TransactionsView } from "@/components/transactions/transactions-view";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Tela de Transações (docs/06-SCREENS.md, "Transações") — o módulo mais
 * usado do sistema: filtros, listagem paginada, edição, exclusão com undo,
 * parcelamento e transferência. `Suspense` exigido pelo App Router por causa
 * de `useSearchParams` em `TransactionsView` (filtros persistidos na URL).
 */
export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionsPageSkeleton />}>
      <TransactionsView />
    </Suspense>
  );
}

function TransactionsPageSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-[38px] w-full max-w-md" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
