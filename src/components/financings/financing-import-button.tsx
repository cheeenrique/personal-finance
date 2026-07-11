"use client";

import { useState } from "react";

import { PasswordProtectedFileField } from "@/components/imports/password-protected-file-field";
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
 * "Importar de documento" — sobe PDF/foto do CCB/contrato de banco (inclusive PDF
 * cifrado, `PasswordProtectedFileField`), chama `parseFinancingDocumentAction`
 * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 2")
 * e devolve o `ParsedFinancing` pro `FinancingFormModal` pré-preencher via `onParsed`.
 * Sem passo de prévia separado: o próprio form de criação JÁ é a prévia.
 */
export function FinancingImportButton({ onParsed, disabled }: FinancingImportButtonProps) {
  const [importing, setImporting] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");

  async function handleFileSelect(file: File) {
    setImporting(true);
    try {
      const base64 = await fileToBase64(file);
      const result = await parseFinancingDocumentAction(base64, file.type, hasPassword ? password : undefined);
      if (!result.success) {
        notifyError(result.error.message);
        return;
      }
      onParsed(result.data);
    } finally {
      setImporting(false);
      // Remonta o <input type="file"> — permite reimportar o MESMO arquivo.
      setInputKey((key) => key + 1);
    }
  }

  return (
    <PasswordProtectedFileField
      idPrefix="financing-import"
      mode="standalone"
      label="Importar de documento (opcional)"
      helperText="PDF ou foto do CCB/contrato do banco — os campos abaixo são pré-preenchidos automaticamente. Revise antes de salvar."
      accept={ACCEPTED_MIME_TYPES}
      onFileSelect={(file) => void handleFileSelect(file)}
      loading={importing}
      loadingLabel="Lendo e extraindo os dados do contrato…"
      inputKey={inputKey}
      hasPassword={hasPassword}
      onHasPasswordChange={setHasPassword}
      password={password}
      onPasswordChange={setPassword}
      disabled={disabled}
    />
  );
}
