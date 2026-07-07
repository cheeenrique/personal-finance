"use client";

import { useTransition } from "react";
import { Download, Loader2, ShieldCheck } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { exportCSVAction } from "@/modules/reports/actions";
import { notifyError, notifySuccess } from "@/lib/toast";

/** `YYYY-MM-DD` local pro nome do arquivo — só formatação de exibição, sem timezone de negócio envolvido. */
function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `transacoes-${todayForFilename()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Dados — docs/12-SETTINGS.md, item 5. Export CSV reusa `exportCSVAction`
 * (`modules/reports`) sem filtros (todas as transações). Backup é só texto
 * explicativo, read-only (estratégia real vive no provider — `01-STACK.md`).
 */
export function DataCard() {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportCSVAction({});

      if (!result.success) {
        notifyError(result.error.message);
        return;
      }

      downloadCsv(result.data);
      notifySuccess("Exportação concluída");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados</CardTitle>
        <CardDescription>Exporte suas transações ou consulte a estratégia de backup.</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleExport}
          disabled={isPending}
          className="w-fit"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="size-4" aria-hidden="true" />
          )}
          Exportar transações (CSV)
        </Button>

        <div className="flex items-start gap-2.5 rounded-lg bg-secondary/60 p-3">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-[13px] font-medium text-muted-foreground">
            Backup automático via point-in-time recovery do provedor de banco de dados
            (Neon/Supabase/Railway), complementado por dumps manuais periódicos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
