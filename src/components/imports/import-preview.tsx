"use client";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EntitySelectOption } from "@/components/forms/entity-select";
import type { ImportTransactionType } from "@/modules/imports/types";
import { formatBRL } from "@/lib/money/format";
import { aggregatePreview } from "./import-file-utils";
import { ImportPreviewPanel } from "./import-preview-panel";
import type { ImportFileEntry } from "./import-types";

type ImportPreviewProps = {
  entries: ImportFileEntry[];
  /** Categorias do usuário já filtradas por Receita/Despesa (Refino 3) — repassado direto pra `ImportPreviewPanel`. */
  categoryOptionsByType: Record<ImportTransactionType, EntitySelectOption[]>;
  onCategoryChange: (entryId: string, novosIndex: number, categoryId: string | null) => void;
};

/**
 * Step 2 do import: KPIs agregados de todos os arquivos + prévia por
 * arquivo. Com mais de um arquivo analisado, cada um ganha sua própria aba
 * (total/novos/duplicados/erros nunca se misturam entre arquivos — handoff,
 * "Step preview"). Com um só, mostra a prévia direto, sem o chrome de abas.
 */
export function ImportPreview({ entries, categoryOptionsByType, onCategoryChange }: ImportPreviewProps) {
  const analyzed = entries.filter((entry) => entry.preview !== null || entry.previewError !== null);
  const totals = aggregatePreview(entries);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-center">
        <div>
          <p className="text-lg font-extrabold text-foreground">{totals.total}</p>
          <p className="text-xs font-semibold text-muted-foreground">No total</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-on-success">{totals.novos}</p>
          <p className="text-xs font-semibold text-muted-foreground">Novos</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-muted-foreground">{totals.duplicados}</p>
          <p className="text-xs font-semibold text-muted-foreground">Já importados</p>
        </div>
      </div>

      {/* Impacto no caixa dos "novos" — mesmo par entradas/saídas do resumo de fluxo da tela (`AccountFlowSummary`), pra confirmar o efeito ANTES de gravar. */}
      <div className="flex gap-3">
        <div className="flex-1 rounded-xl border border-success/30 bg-success/10 p-3">
          <p className="text-xs font-bold text-muted-foreground">Entradas a importar</p>
          <p className="mt-1 font-mono text-base font-semibold text-on-success">+ {formatBRL(totals.incomeTotal)}</p>
        </div>
        <div className="flex-1 rounded-xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-xs font-bold text-muted-foreground">Saídas a importar</p>
          <p className="mt-1 font-mono text-base font-semibold text-on-danger">- {formatBRL(totals.expenseTotal)}</p>
        </div>
      </div>

      {analyzed.length > 1 ? (
        <Tabs defaultValue={analyzed[0]?.id}>
          <TabsList className="w-full overflow-x-auto">
            {analyzed.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="gap-1.5">
                <span className="max-w-32 truncate">{entry.name}</span>
                {entry.preview && (
                  <Badge variant={entry.preview.erros.length > 0 ? "destructive" : "secondary"} className="shrink-0">
                    {entry.preview.novos.length}
                  </Badge>
                )}
                {entry.previewError && (
                  <Badge variant="destructive" className="shrink-0">
                    !
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          {analyzed.map((entry) => (
            <TabsContent key={entry.id} value={entry.id} className="pt-3">
              <ImportPreviewPanel
                entry={entry}
                categoryOptionsByType={categoryOptionsByType}
                onCategoryChange={onCategoryChange}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        analyzed[0] && (
          <ImportPreviewPanel
            entry={analyzed[0]}
            categoryOptionsByType={categoryOptionsByType}
            onCategoryChange={onCategoryChange}
          />
        )
      )}
    </div>
  );
}
