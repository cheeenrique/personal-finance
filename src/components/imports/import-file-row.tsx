"use client";

import { motion } from "framer-motion";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, X, XCircle } from "lucide-react";

import { IconActionButton } from "@/components/shared/icon-action-button";
import { cn } from "@/lib/utils";
import { PasswordProtectedFileField } from "./password-protected-file-field";
import { formatFileSize } from "./import-file-utils";
import { listItemVariants } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

type ImportFileRowProps = {
  entry: ImportFileEntry;
  onRemove: () => void;
  disabled?: boolean;
  /** Fatura de cartão costuma vir cifrada (CPF/data de nascimento); extrato de conta, na prática, nunca — campo de senha só aparece quando faz sentido pro target (`ImportDropzone allowPassword`). */
  allowPassword?: boolean;
  onPasswordChange?: (hasPassword: boolean, password: string) => void;
};

const STATUS_LABEL: Record<ImportFileEntry["status"], string> = {
  reading: "Lendo…",
  ready: "Pronto",
  error: "Erro",
};

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

export function ImportFileRow({ entry, onRemove, disabled, allowPassword, onPasswordChange }: ImportFileRowProps) {
  const { Icon, tile } = getFileTypeVisual(entry.name);
  const statusText = entry.status === "error" ? entry.error : STATUS_LABEL[entry.status];
  const showPasswordField = Boolean(allowPassword) && entry.name.toLowerCase().endsWith(".pdf") && entry.status !== "error";

  return (
    <motion.li variants={listItemVariants} exit="exit" className="flex flex-col border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-2.5">
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
      </div>

      {showPasswordField && onPasswordChange && (
        <PasswordProtectedFileField
          mode="embedded"
          idPrefix={`import-file-${entry.id}`}
          hasPassword={entry.hasPassword}
          onHasPasswordChange={(hasPassword) => onPasswordChange(hasPassword, entry.password)}
          password={entry.password}
          onPasswordChange={(password) => onPasswordChange(entry.hasPassword, password)}
          disabled={disabled}
        />
      )}
    </motion.li>
  );
}
