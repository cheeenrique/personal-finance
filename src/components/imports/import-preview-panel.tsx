"use client";

import { motion } from "framer-motion";

import { TransactionType } from "@/generated/prisma/enums";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { listContainerVariants, listItemVariants } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

type ImportPreviewPanelProps = { entry: ImportFileEntry };

/**
 * Prévia de UM arquivo — lista de lançamentos novos + erros de parse.
 * Reusado tanto direto (1 arquivo) quanto dentro de cada aba (múltiplos
 * arquivos, `import-preview.tsx`) — nunca mistura a origem entre arquivos
 * (handoff, "Step preview": "não misturar origem").
 */
export function ImportPreviewPanel({ entry }: ImportPreviewPanelProps) {
  if (entry.previewError) {
    return (
      <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm font-medium text-on-danger">
        {entry.previewError}
      </p>
    );
  }

  if (!entry.preview) return null;

  const { novos, erros } = entry.preview;

  return (
    <div className="flex flex-col gap-3">
      {novos.length === 0 && erros.length === 0 && (
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-center text-sm font-medium text-muted-foreground">
          Nada novo neste arquivo.
        </p>
      )}

      {novos.length > 0 && (
        <motion.ul
          variants={listContainerVariants(0.05)}
          initial="hidden"
          animate="visible"
          className="flex max-h-64 flex-col overflow-y-auto rounded-lg border border-border"
        >
          {novos.map((item, index) => (
            <motion.li
              key={index}
              variants={listItemVariants}
              className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-sm last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateSaoPaulo(item.date)} · {item.categoryName ?? "Sem categoria"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 font-mono font-semibold",
                  item.type === TransactionType.INCOME ? "text-on-success" : "text-on-danger",
                )}
              >
                {item.type === TransactionType.INCOME ? "+" : "-"}
                {formatBRL(item.amount)}
              </span>
            </motion.li>
          ))}
        </motion.ul>
      )}

      {erros.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs font-extrabold text-on-danger">
            {erros.length} linha(s) com erro — não serão importadas
          </p>
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {erros.map((item, index) => (
              <li key={index}>{item.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
