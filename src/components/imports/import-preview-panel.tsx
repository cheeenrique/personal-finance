"use client";

import { motion } from "framer-motion";

import { TransactionType } from "@/generated/prisma/enums";
import { EntitySelect, type EntitySelectOption } from "@/components/forms/entity-select";
import type { ImportTransactionType } from "@/modules/imports/types";
import { formatDateSaoPaulo } from "@/lib/date/format";
import { formatBRL } from "@/lib/money/format";
import { cn } from "@/lib/utils";
import { listContainerVariants, listItemVariants } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

/** Sentinela pro item "Sem categoria" no select por linha — nunca colide com um `cuid` real de categoria. */
export const NO_CATEGORY_VALUE = "__no-category__";

type ImportPreviewPanelProps = {
  entry: ImportFileEntry;
  /** Categorias do usuário já filtradas por Receita/Despesa (Refino 3) — `import-preview.tsx` monta a partir de `useTransactionsReferenceData`. */
  categoryOptionsByType: Record<ImportTransactionType, EntitySelectOption[]>;
  /** `novosIndex` = índice em `entry.preview.novos` — repassado direto pra `useImportFiles().setItemCategory`. */
  onCategoryChange: (entryId: string, novosIndex: number, categoryId: string | null) => void;
};

/**
 * Prévia de UM arquivo — lista de lançamentos novos + erros de parse.
 * Reusado tanto direto (1 arquivo) quanto dentro de cada aba (múltiplos
 * arquivos, `import-preview.tsx`) — nunca mistura a origem entre arquivos
 * (handoff, "Step preview": "não misturar origem"). Cada item novo tem um
 * select de categoria (Refino 3) — sem ele, TODO lançamento importado nasce
 * "Sem categoria" e corrigir 1 a 1 depois é inviável numa fatura inteira.
 */
export function ImportPreviewPanel({ entry, categoryOptionsByType, onCategoryChange }: ImportPreviewPanelProps) {
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
          className="flex flex-col rounded-lg border border-border"
        >
          {novos.map((item, index) => {
            const options = categoryOptionsByType[item.type];
            const selected = entry.categoryOverrides[index] ?? NO_CATEGORY_VALUE;

            return (
              <motion.li
                key={index}
                variants={listItemVariants}
                className="flex flex-col gap-2 border-b border-border px-3 py-2 text-sm last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-foreground">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateSaoPaulo(item.date)}
                    {/* Sugestão do histórico sem categoria correspondente pré-selecionada (nome não bateu com nenhuma
                        categoria atual do usuário) — mostra o nome sugerido mesmo assim, pro usuário decidir. */}
                    {item.categoryName && selected === NO_CATEGORY_VALUE && ` · sugestão: ${item.categoryName}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:justify-end">
                  <EntitySelect
                    aria-label={`Categoria de ${item.description}`}
                    className="h-8 w-40 text-xs"
                    options={[{ value: NO_CATEGORY_VALUE, label: "Sem categoria" }, ...options]}
                    value={selected}
                    onValueChange={(value) =>
                      onCategoryChange(entry.id, index, value === NO_CATEGORY_VALUE ? null : value)
                    }
                    placeholder="Sem categoria"
                  />
                  <span
                    className={cn(
                      "w-28 shrink-0 text-right font-mono font-semibold tabular-nums",
                      item.type === TransactionType.INCOME ? "text-on-success" : "text-on-danger",
                    )}
                  >
                    {item.type === TransactionType.INCOME ? "+" : "-"}
                    {formatBRL(item.amount)}
                  </span>
                </div>
              </motion.li>
            );
          })}
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
