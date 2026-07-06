"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
};

type DataTablePaginationProps = PaginationState & {
  onPageChange: (page: number) => void;
};

/**
 * Paginação server-side — só usada em `/transactions` (única lista que
 * cresce sem limite, docs/04-DESIGN_SYSTEM.md, "Tabelas").
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-center gap-3 py-1 text-sm font-medium text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <span>
        Página <span className="font-mono font-semibold text-foreground">{page}</span> de{" "}
        <span className="font-mono font-semibold text-foreground">{totalPages}</span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}
