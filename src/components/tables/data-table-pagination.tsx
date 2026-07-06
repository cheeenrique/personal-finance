"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PaginationState = {
  page: number;
  pageSize: number;
  total: number;
};

type DataTablePaginationProps = PaginationState & {
  onPageChange: (page: number) => void;
};

const SIBLING_COUNT = 1;

/**
 * Janela de páginas exibidas: sempre 1ª e última, a página atual +
 * `SIBLING_COUNT` vizinhas de cada lado, "…" pro que fica de fora
 * (design/Personal Finance App.dc.html, rodapé da tabela de transações).
 */
function getPageNumbers(current: number, total: number): (number | "ellipsis")[] {
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - SIBLING_COUNT);
  const end = Math.min(total - 1, current + SIBLING_COUNT);

  if (start > 2) pages.push("ellipsis");
  for (let page = start; page <= end; page++) pages.push(page);
  if (end < total - 1) pages.push("ellipsis");
  if (total > 1) pages.push(total);

  return pages;
}

/**
 * Paginação server-side — só usada em `/transactions` (única lista que
 * cresce sem limite, docs/04-DESIGN_SYSTEM.md, "Tabelas"). Rodapé fixo do
 * card da `DataTable`: "Mostrando N de M" à esquerda, Anterior/números/Próxima
 * à direita (design/Personal Finance App.dc.html, rodapé da tabela).
 */
export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
}: DataTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const itemsOnPage = Math.min(pageSize, total - (page - 1) * pageSize);
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] py-[13px]">
      <span className="text-[12.5px] font-semibold text-muted-foreground">
        Mostrando {Math.max(itemsOnPage, 0)} de {total}
      </span>

      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          Anterior
        </Button>

        {pageNumbers.map((entry, index) =>
          entry === "ellipsis" ? (
            <span
              key={`ellipsis-${index}`}
              className="flex size-8 items-center justify-center text-sm text-muted-foreground"
              aria-hidden="true"
            >
              …
            </span>
          ) : (
            <Button
              key={entry}
              type="button"
              variant={entry === page ? "default" : "outline"}
              size="icon"
              className={cn("font-mono text-[13px] font-semibold", entry === page && "cursor-default")}
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              aria-label={`Página ${entry}`}
            >
              {entry}
            </Button>
          ),
        )}

        <Button
          type="button"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Próxima página"
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
