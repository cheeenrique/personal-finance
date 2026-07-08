"use client";

import { useState, type ChangeEvent } from "react";
import { Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseFinancingDocumentAction } from "@/app/(app)/financings/actions";
import { notifyError } from "@/lib/toast";
import type { ParsedFinancing } from "@/modules/telegram/types";

const ACCEPTED_MIME_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

type FinancingImportButtonProps = {
  onParsed: (parsed: ParsedFinancing) => void;
  disabled?: boolean;
};

/** `ArrayBuffer` → base64 sem passar por `FileReader` (a `data:` URL dele traria o prefixo `data:<mime>;base64,` junto, que teríamos que cortar) — mesma técnica de encoding usada pelo resto do app pra binário. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/**
 * "Importar de documento" (docs da tarefa, item 5) — sobe PDF/foto do
 * CCB/contrato de banco, chama `parseFinancingDocumentAction` (Gemini) e
 * devolve o `ParsedFinancing` pro `FinancingFormModal` pré-preencher via
 * `onParsed`. Sem passo de prévia separado (diferente de `OfxImportModal`):
 * o próprio form de criação JÁ é a prévia — o usuário revisa/edita os campos
 * pré-preenchidos e só grava ao clicar "Salvar" (nunca cria nada aqui).
 * Só aparece na CRIAÇÃO (`FinancingFormModal` não renderiza isto editando).
 */
export function FinancingImportButton({ onParsed, disabled }: FinancingImportButtonProps) {
  const [importing, setImporting] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await parseFinancingDocumentAction(base64, file.type);
      if (!result.success) {
        notifyError(result.error.message);
        return;
      }
      onParsed(result.data);
    } finally {
      setImporting(false);
      // Remonta o <input type="file"> (mesmo truque de `OfxImportModal`) —
      // permite reimportar o MESMO arquivo (ex.: tentar de novo depois de
      // corrigir algo), já que um `<input>` não dispara `onChange` de novo
      // pro mesmo valor sem isso.
      setInputKey((key) => key + 1);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-dashed border-border p-3">
      <Label htmlFor="financing-import-file" className="text-[12.5px]">
        Importar de documento (opcional)
      </Label>
      <Input
        key={inputKey}
        id="financing-import-file"
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        onChange={handleChange}
        disabled={disabled || importing}
      />
      {importing && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Lendo e extraindo os dados do contrato…
        </p>
      )}
      <p className="text-[11.5px] font-medium text-muted-foreground">
        PDF ou foto do CCB/contrato do banco — os campos abaixo são pré-preenchidos automaticamente. Revise antes de
        salvar.
      </p>
    </div>
  );
}
