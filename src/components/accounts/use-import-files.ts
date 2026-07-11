"use client";

import { useState } from "react";

import { previewImportAction, commitImportAction } from "@/modules/imports/actions";
import { buildFileEntry, readEntryContent } from "./import-file-utils";
import type { ImportFileEntry, ImportStep } from "./import-types";

type EntryPatch = Partial<ImportFileEntry> & { id: string };

function applyPatches(entries: ImportFileEntry[], patches: EntryPatch[]): ImportFileEntry[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return entries.map((entry) => (byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry));
}

/**
 * Estado do importador multi-arquivo (docs/superpowers/specs — redesign do
 * dropzone). Front itera as Server Actions por arquivo — 1 `previewImportAction`
 * + 1 `commitImportAction` cada, sem action batch nova (decisão do
 * coordenador) — e agrega tudo aqui num único array de `ImportFileEntry`.
 */
export function useImportFiles(accountId: string) {
  const [step, setStep] = useState<ImportStep>("select");
  const [entries, setEntries] = useState<ImportFileEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  /** Adiciona arquivos soltos/selecionados, dedupando por (nome, tamanho), e dispara a leitura de conteúdo de cada um em paralelo. */
  async function addFiles(incoming: FileList | File[]) {
    const existingKeys = new Set(entries.map((entry) => `${entry.name}-${entry.size}`));
    const additions = Array.from(incoming)
      .filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
      .map(buildFileEntry);
    if (additions.length === 0) return;

    setEntries((current) => [...current, ...additions]);

    const readable = additions.filter((entry) => entry.status === "reading");
    if (readable.length === 0) return;

    const patches = await Promise.all(
      readable.map(async (entry): Promise<EntryPatch> => {
        try {
          const content = await readEntryContent(entry.file);
          return { id: entry.id, status: "ready", content, error: null };
        } catch {
          return { id: entry.id, status: "error", content: null, error: "Não foi possível ler o arquivo." };
        }
      }),
    );

    setEntries((current) => applyPatches(current, patches));
  }

  function removeFile(id: string) {
    setEntries((current) => current.filter((entry) => entry.id !== id));
  }

  /** Chama `previewImportAction` pra cada arquivo pronto, em paralelo — nada é gravado ainda. */
  async function analyze(): Promise<ImportFileEntry[]> {
    const ready = entries.filter((entry) => entry.status === "ready");
    if (ready.length === 0) return entries;

    setIsAnalyzing(true);
    const patches = await Promise.all(
      ready.map(async (entry): Promise<EntryPatch> => {
        try {
          const response = await previewImportAction({ kind: "account", accountId }, entry.name, entry.content!);
          return response.success
            ? { id: entry.id, preview: response.data.preview, parsed: response.data.transactions, previewError: null }
            : { id: entry.id, preview: null, parsed: null, previewError: response.error.message };
        } catch {
          return { id: entry.id, preview: null, previewError: "Não foi possível analisar o arquivo." };
        }
      }),
    );

    const nextEntries = applyPatches(entries, patches);
    setEntries(nextEntries);
    setIsAnalyzing(false);
    setStep("preview");
    return nextEntries;
  }

  /** Chama `commitImportAction` pra cada arquivo com prévia bem-sucedida, em paralelo — reenvia as transações já parseadas na prévia (sem 2º parse) e reimportar é seguro (dedup no backend). */
  async function confirm(): Promise<ImportFileEntry[]> {
    const analyzed = entries.filter((entry) => entry.preview !== null && entry.parsed !== null);
    if (analyzed.length === 0) return entries;

    setIsConfirming(true);
    const patches = await Promise.all(
      analyzed.map(async (entry): Promise<EntryPatch> => {
        try {
          const response = await commitImportAction({ kind: "account", accountId }, entry.parsed!, entry.preview!.erros);
          return response.success
            ? { id: entry.id, commit: response.data, commitError: null }
            : { id: entry.id, commit: null, commitError: response.error.message };
        } catch {
          return { id: entry.id, commit: null, commitError: "Não foi possível confirmar a importação." };
        }
      }),
    );

    const nextEntries = applyPatches(entries, patches);
    setEntries(nextEntries);
    setIsConfirming(false);
    setStep("result");
    return nextEntries;
  }

  /** Volta pra seleção mantendo os arquivos já lidos — permite retentar (`analyze` de novo, ex.: PDF que falhou na extração) ou trocar arquivos sem recomeçar do zero. */
  function back() {
    setStep("select");
  }

  function reset() {
    setStep("select");
    setEntries([]);
    setIsAnalyzing(false);
    setIsConfirming(false);
  }

  return { step, entries, isAnalyzing, isConfirming, addFiles, removeFile, analyze, confirm, back, reset };
}
