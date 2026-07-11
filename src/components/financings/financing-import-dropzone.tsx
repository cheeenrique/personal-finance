"use client";

import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { UploadCloud } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn, FOCUS_RING_CLASS } from "@/lib/utils";

const ACCEPTED_MIME_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

type FinancingImportDropzoneProps = {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  hasPassword: boolean;
  onHasPasswordChange: (hasPassword: boolean) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  /** Remonta o `<input type=file>` a cada tentativa — permite reimportar o MESMO arquivo (mesmo truque de `import-dropzone.tsx`/`financing-import-button.tsx` atual). */
  inputKey: number;
};

/**
 * Dropzone single-file do contrato/CCB do financiamento — MESMO padrão
 * visual/comportamento de `ImportDropzone` (`components/imports/`, import de
 * extrato/fatura): drag&drop, `border-2 border-dashed rounded-2xl
 * bg-muted/20`, `UploadCloud`, input nativo escondido + `inputRef.click()`,
 * `ease-pf-out`. Adaptado pra 1 arquivo só — financiamento importa 1
 * documento por vez, sem lista de entries (ver `financing-import-button.tsx`).
 *
 * Toggle "tem senha?" fica sempre visível ABAIXO do dropzone, não dentro de
 * um item de lista (`ImportFileRow`'s `PasswordProtectedFileField
 * mode="embedded"` pressupõe uma linha de arquivo já existente — aqui não há
 * lista). Precisa ser setado ANTES de soltar o arquivo: o parse dispara
 * imediatamente ao selecionar (sem passo de prévia separado), usando o
 * `hasPassword`/`password` correntes.
 */
export function FinancingImportDropzone({
  onFileSelect,
  disabled,
  hasPassword,
  onHasPasswordChange,
  password,
  onPasswordChange,
  inputKey,
}: FinancingImportDropzoneProps) {
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
    const file = event.target.files?.[0];
    if (file) onFileSelect(file);
    event.target.value = "";
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) setIsDragOver(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (!disabled && file) onFileSelect(file);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-label="Selecionar contrato ou CCB do financiamento"
        onClick={openFilePicker}
        onKeyDown={handleKeyDown}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed border-border bg-muted/20 px-6 py-8 text-center transition-colors duration-150 ease-pf-out",
          isDragOver && "border-primary bg-primary/5",
          disabled && "pointer-events-none opacity-50",
          FOCUS_RING_CLASS,
        )}
      >
        <UploadCloud
          className={cn(
            "size-7 text-muted-foreground transition-transform duration-150 ease-pf-out",
            isDragOver && "scale-105 text-primary",
          )}
          aria-hidden="true"
        />
        <p className="text-sm font-bold text-foreground">Arraste o contrato ou CCB aqui</p>
        <p className="text-xs font-medium text-muted-foreground">ou clique para selecionar</p>
        <p className="text-xs font-medium text-muted-foreground/70">PDF, JPG, PNG</p>
      </div>

      <input
        key={inputKey}
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="flex flex-col gap-2 rounded-[10px] border border-border px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="financing-import-has-password" className="text-[12.5px] font-medium text-muted-foreground">
            Este arquivo tem senha?
          </Label>
          <Switch
            id="financing-import-has-password"
            size="sm"
            checked={hasPassword}
            onCheckedChange={onHasPasswordChange}
            disabled={disabled}
          />
        </div>
        {hasPassword && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="financing-import-password" className="sr-only">
              Senha do arquivo
            </Label>
            <Input
              id="financing-import-password"
              type="password"
              placeholder="Senha do arquivo"
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              disabled={disabled}
              autoComplete="off"
            />
          </div>
        )}
      </div>
    </div>
  );
}
