"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { exportCSVAction } from "@/modules/reports/actions";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/lib/toast";
import type { ReportTypeFilter } from "./report-filters";

export type ExportCsvFilters = {
  dateFrom: string;
  dateTo: string;
  categoryId: string | undefined;
  accountId: string | undefined;
  cardId: string | undefined;
  type: ReportTypeFilter | undefined;
};

type ExportCsvButtonProps = {
  filters: ExportCsvFilters;
};

/** `YYYY-MM-DD` (America/Sao_Paulo, já resolvido pelo Server Component) — usado só no nome do arquivo. */
function csvFileName(dateFrom: string, dateTo: string): string {
  return `relatorio-transacoes_${dateFrom}_a_${dateTo}.csv`;
}

/**
 * Dispara `exportCSVAction` (Server Action, `modules/reports/actions.ts`) com
 * os filtros globais atuais e baixa o resultado como arquivo — a Action já
 * devolve o CSV pronto (string), então o download é só Blob + link temporário
 * (docs/28-REPORTS.md, "Exportação"). Sem `revalidatePath`: export é
 * só-leitura, não muda estado nenhum.
 */
export function ExportCsvButton({ filters }: ExportCsvButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const result = await exportCSVAction({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        categoryId: filters.categoryId,
        accountId: filters.accountId,
        cardId: filters.cardId,
        type: filters.type,
      });

      if (!result.success) {
        notifyError(result.error.message);
        return;
      }

      downloadCsv(result.data, csvFileName(filters.dateFrom, filters.dateTo));
      notifySuccess("CSV exportado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={() => void handleExport()} disabled={loading} className="gap-1.5">
      {loading ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="size-3.5" aria-hidden="true" />
      )}
      Exportar CSV
    </Button>
  );
}

function downloadCsv(csv: string, fileName: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
