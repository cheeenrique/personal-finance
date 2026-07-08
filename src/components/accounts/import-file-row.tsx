"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, X, XCircle } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { cn } from "@/lib/utils";
import { formatFileSize } from "./import-file-utils";
import { listItemVariants } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

type ImportFileRowProps = {
  entry: ImportFileEntry;
  onRemove: () => void;
  disabled?: boolean;
};

const STATUS_LABEL: Record<ImportFileEntry["status"], string> = {
  reading: "Lendo…",
  ready: "Pronto",
  error: "Erro",
};

/** PDF vermelho (dado por Gemini, formato mais custoso); XLS/XLSX planilha; OFX/CSV documento (handoff, "Step select"). */
function getFileTypeVisual(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return { Icon: FileText, tile: "bg-destructive/16 text-on-danger" };
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return { Icon: FileSpreadsheet, tile: "bg-secondary text-muted-foreground" };
  }
  return { Icon: FileText, tile: "bg-secondary text-muted-foreground" };
}

function StatusIndicator({ status }: { status: ImportFileEntry["status"] }) {
  if (status === "reading") return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
  if (status === "ready") return <CheckCircle2 className="size-3.5 text-on-success" aria-hidden="true" />;
  return <XCircle className="size-3.5 text-on-danger" aria-hidden="true" />;
}

/** Uma linha do dropzone multi-arquivo — ícone por tipo, nome/tamanho, status (lendo/pronto/erro) e remover (handoff, "Step select"). */
export function ImportFileRow({ entry, onRemove, disabled }: ImportFileRowProps) {
  const { Icon, tile } = getFileTypeVisual(entry.name);
  const statusText = entry.status === "error" ? entry.error : STATUS_LABEL[entry.status];

  return (
    <motion.li
      variants={listItemVariants}
      exit="exit"
      className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tile)}>
        <Icon className="size-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" aria-live="polite">
          <span>{formatFileSize(entry.size)}</span>
          <span aria-hidden="true">·</span>
          <StatusIndicator status={entry.status} />
          <span className="truncate">{statusText}</span>
        </p>
      </div>

      <IconActionButton icon={X} tone="danger" label="Remover arquivo" onClick={onRemove} disabled={disabled} />
    </motion.li>
  );
}
