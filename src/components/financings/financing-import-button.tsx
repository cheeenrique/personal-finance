"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { STEP_TRANSITION, stepVariants } from "@/components/imports/import-motion";
import { parseFinancingDocumentAction } from "@/app/(app)/financings/actions";
import { notifyError } from "@/lib/toast";
import type { ParsedFinancing } from "@/modules/telegram/types";
import { FinancingImportDropzone } from "./financing-import-dropzone";
import { FinancingImportAnalyzing } from "./financing-import-analyzing";

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
 * cifrado, toggle "tem senha?" do `FinancingImportDropzone`), chama `parseFinancingDocumentAction`
 * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 2")
 * e devolve o `ParsedFinancing` pro `FinancingFormModal` pré-preencher via `onParsed`.
 * Sem passo de prévia separado: o próprio form de criação JÁ é a prévia.
 *
 * Padrão dropzone (`FinancingImportDropzone`, igual ao import de fatura/conta)
 * enquanto ocioso; troca pro painel de análise (`FinancingImportAnalyzing`,
 * beam de scan + fases rotativas) durante `importing` — fade+slide de 220ms
 * (`stepVariants`/`STEP_TRANSITION`, mesma transição de troca de step do
 * import de extrato/fatura) entre os dois.
 */
export function FinancingImportButton({ onParsed, disabled }: FinancingImportButtonProps) {
  const [importing, setImporting] = useState(false);
  const [inputKey, setInputKey] = useState(0);
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [fileName, setFileName] = useState("");

  async function handleFileSelect(file: File) {
    setFileName(file.name);
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
      // Zera senha/toggle após cada tentativa — senão um próximo arquivo (diferente)
      // reenviaria a senha stale do anterior (isolamento por arquivo, igual ao dropzone).
      setHasPassword(false);
      setPassword("");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-medium text-muted-foreground">Importar de documento (opcional)</span>
      <AnimatePresence mode="wait" initial={false}>
        {importing ? (
          <motion.div key="analyzing" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={STEP_TRANSITION}>
            <FinancingImportAnalyzing fileName={fileName} />
          </motion.div>
        ) : (
          <motion.div key="dropzone" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={STEP_TRANSITION}>
            <FinancingImportDropzone
              onFileSelect={(file) => void handleFileSelect(file)}
              disabled={disabled}
              hasPassword={hasPassword}
              onHasPasswordChange={setHasPassword}
              password={password}
              onPasswordChange={setPassword}
              inputKey={inputKey}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-[11.5px] font-medium text-muted-foreground">
        PDF ou foto do CCB/contrato do banco — os campos abaixo são pré-preenchidos automaticamente. Revise antes de salvar.
      </p>
    </div>
  );
}
