"use client";

import { motion } from "framer-motion";
import { CheckCircle2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { aggregateCommit } from "./import-file-utils";
import { successIconTransition } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

type ImportResultProps = { entries: ImportFileEntry[] };

/**
 * Step 3 do import: KPIs agregados de commit de todos os arquivos + ícone
 * de sucesso com pop de entrada (handoff, "Step result"). Se TODO arquivo
 * falhou o commit (ex.: erro de rede a meio do confirm em multi-arquivo —
 * cenário que não existia no fluxo single-file), troca o check verde por um
 * alerta em vez de fingir sucesso.
 */
export function ImportResult({ entries }: ImportResultProps) {
  const totals = aggregateCommit(entries);
  const failed = entries.filter((entry) => entry.commitError !== null);
  const allFailed = failed.length > 0 && failed.length === entries.length;

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={successIconTransition}
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          allFailed ? "bg-destructive/16 text-on-danger" : "bg-success/16 text-on-success",
        )}
      >
        {allFailed ? (
          <TriangleAlert className="size-6" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="size-6" aria-hidden="true" />
        )}
      </motion.div>

      <div className="grid w-full grid-cols-3 gap-3 rounded-lg border border-border bg-muted/40 p-3 text-center">
        <div>
          <p className="text-lg font-extrabold text-on-success">{totals.imported}</p>
          <p className="text-xs font-semibold text-muted-foreground">Importados</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-muted-foreground">{totals.duplicados}</p>
          <p className="text-xs font-semibold text-muted-foreground">Já existiam</p>
        </div>
        <div>
          <p className="text-lg font-extrabold text-on-danger">{totals.erros}</p>
          <p className="text-xs font-semibold text-muted-foreground">Com erro</p>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="flex w-full flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-extrabold text-on-danger">{failed.length} arquivo(s) não confirmado(s)</p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {failed.map((entry) => (
              <li key={entry.id}>
                {entry.name}: {entry.commitError}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
