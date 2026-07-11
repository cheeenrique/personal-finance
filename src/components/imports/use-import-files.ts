"use client";

import { useState } from "react";

import { previewImportAction, commitImportAction } from "@/modules/imports/actions";
import type { ImportTarget } from "@/modules/imports/types";
import { applyCategoryOverrides, buildFileEntry, mapNovosToParsedIndexes, readEntryContent } from "./import-file-utils";
import type { ImportFileEntry, ImportStep } from "./import-types";

type EntryPatch = Partial<ImportFileEntry> & { id: string };

function applyPatches(entries: ImportFileEntry[], patches: EntryPatch[]): ImportFileEntry[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return entries.map((entry) => (byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry));
}

/**
 * Estado do importador multi-arquivo — generalizado por `target` (conta OU cartão,
 * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1").
 * Front itera as Server Actions por arquivo — 1 `previewImportAction` + 1
 * `commitImportAction` cada, sem action batch nova.
 *
 * `categoryNameToId` (Refino 3) — nome (lowercase) → id das categorias do
 * usuário, usado só pra PRÉ-selecionar a categoria sugerida (`categoryName`,
 * resolvida por histórico no backend) no select por item da prévia; nunca
 * usado pra inventar categoria — sem match, o item nasce em "Sem categoria".
 */
export function useImportFiles(target: ImportTarget, categoryNameToId: Map<string, string>) {
  const [step, setStep] = useState<ImportStep>("select");
  const [entries, setEntries] = useState<ImportFileEntry[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

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

  /** Atualiza `hasPassword`/`password` de UM arquivo — chamado pelo `PasswordProtectedFileField` embutido em `ImportFileRow` (`ImportDropzone`, só quando `target.kind==="card"`). */
  function setPassword(id: string, hasPassword: boolean, password: string) {
    setEntries((current) => applyPatches(current, [{ id, hasPassword, password }]));
  }

  /**
   * Categoria escolhida pelo usuário pra UM item da prévia (Refino 3,
   * `novosIndex` = índice em `preview.novos`, chamado pelo select de
   * `ImportPreviewPanel`). `categoryId: null` = "Sem categoria" explícito.
   */
  function setItemCategory(entryId: string, novosIndex: number, categoryId: string | null) {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const categoryOverrides = [...entry.categoryOverrides];
        categoryOverrides[novosIndex] = categoryId;
        return { ...entry, categoryOverrides };
      }),
    );
  }

  async function analyze(): Promise<ImportFileEntry[]> {
    const ready = entries.filter((entry) => entry.status === "ready");
    if (ready.length === 0) return entries;

    setIsAnalyzing(true);
    const patches = await Promise.all(
      ready.map(async (entry): Promise<EntryPatch> => {
        try {
          const password = entry.hasPassword && entry.password ? entry.password : undefined;
          const response = await previewImportAction(target, entry.name, entry.content!, password);
          if (!response.success) {
            return { id: entry.id, preview: null, parsed: null, previewError: response.error.message };
          }

          const { preview, transactions } = response.data;
          const novosParsedIndexes = mapNovosToParsedIndexes(preview.novos, transactions);
          const categoryOverrides = preview.novos.map((item) =>
            item.categoryName ? (categoryNameToId.get(item.categoryName.toLowerCase()) ?? null) : null,
          );

          return {
            id: entry.id,
            preview,
            parsed: transactions,
            previewError: null,
            novosParsedIndexes,
            categoryOverrides,
          };
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

  async function confirm(): Promise<ImportFileEntry[]> {
    const analyzed = entries.filter((entry) => entry.preview !== null && entry.parsed !== null);
    if (analyzed.length === 0) return entries;

    setIsConfirming(true);
    const patches = await Promise.all(
      analyzed.map(async (entry): Promise<EntryPatch> => {
        try {
          const transactions = applyCategoryOverrides(entry.parsed!, entry.novosParsedIndexes, entry.categoryOverrides);
          const response = await commitImportAction(target, transactions, entry.preview!.erros);
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

  function back() {
    setStep("select");
  }

  function reset() {
    setStep("select");
    setEntries([]);
    setIsAnalyzing(false);
    setIsConfirming(false);
  }

  return {
    step,
    entries,
    isAnalyzing,
    isConfirming,
    addFiles,
    removeFile,
    setPassword,
    setItemCategory,
    analyze,
    confirm,
    back,
    reset,
  };
}
