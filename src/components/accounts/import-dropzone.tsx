"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadCloud } from "lucide-react";

import { cn, FOCUS_RING_CLASS } from "@/lib/utils";
import { ACCEPTED_EXTENSIONS } from "./import-file-utils";
import { ImportFileRow } from "./import-file-row";
import { listContainerVariants } from "./import-motion";
import type { ImportFileEntry } from "./import-types";

type ImportDropzoneProps = {
  entries: ImportFileEntry[];
  onAddFiles: (files: FileList | File[]) => void;
  onRemoveFile: (id: string) => void;
  disabled?: boolean;
};

/**
 * Dropzone rico multi-arquivo (handoff, "Step select") — arrasta ou clica
 * pra abrir o seletor nativo; lista os arquivos abaixo com status por item
 * (`ImportFileRow`). Área operável por teclado (`role="button"`, Enter/
 * Espaço abrem o seletor) — nenhum elemento interativo só por mouse.
 */
export function ImportDropzone({ entries, onAddFiles, onRemoveFile, disabled }: ImportDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function openFilePicker() {
    if (!disabled) inputRef.current?.click();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openFilePicker();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) onAddFiles(event.target.files);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setIsDragOver(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    if (!disabled && event.dataTransfer.files.length > 0) onAddFiles(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 py-10 text-center transition-colors duration-150 ease-pf-out",
          isDragOver && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
          FOCUS_RING_CLASS,
        )}
      >
        <UploadCloud
          className={cn(
            "size-8 text-muted-foreground transition-transform duration-150 ease-pf-out",
            isDragOver && "scale-105 text-primary",
          )}
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-foreground">Arraste seus extratos aqui</p>
        <p className="text-xs font-medium text-muted-foreground">ou clique para selecionar</p>
        <p className="text-xs font-medium text-muted-foreground/70">OFX, PDF, XLS, CSV</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_EXTENSIONS.join(",")}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {entries.length > 0 && (
        <motion.ul
          role="list"
          variants={listContainerVariants(0.04)}
          initial="hidden"
          animate="visible"
          className="flex flex-col overflow-hidden rounded-lg border border-border"
        >
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <ImportFileRow key={entry.id} entry={entry} onRemove={() => onRemoveFile(entry.id)} disabled={disabled} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </div>
  );
}
