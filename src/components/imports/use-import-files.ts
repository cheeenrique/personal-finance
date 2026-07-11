"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { createCategoryAction } from "@/modules/categories/actions";
import { previewImportAction, commitImportAction } from "@/modules/imports/actions";
import type { ImportTarget } from "@/modules/imports/types";
import { CATEGORY_TYPE_DEFAULT_COLOR } from "@/components/categories/category-config";
import { TRANSACTIONS_REFERENCE_DATA_QUERY_KEY } from "@/components/transactions/use-transactions-reference-data";
import {
  applyCategoryOverrides,
  buildFileEntry,
  collectCategoriesToCreate,
  createCategoryOverrideValue,
  mapNovosToParsedIndexes,
  readEntryContent,
  resolveCreateOverrides,
} from "./import-file-utils";
import type { ImportFileEntry, ImportStep } from "./import-types";

type EntryPatch = Partial<ImportFileEntry> & { id: string };

function applyPatches(entries: ImportFileEntry[], patches: EntryPatch[]): ImportFileEntry[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return entries.map((entry) => (byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry));
}

/**
 * Cria as categorias que a IA sugeriu e o usuário ainda não tem (sentinela `__create__:`,
 * `import-file-utils.ts` `collectCategoriesToCreate`) — reusa a MESMA action do formulário de
 * categoria (`createCategoryAction`, `category-form-modal.tsx`), sem action nova. 1 clique na
 * prévia = aceitar a sugestão, sem sair do fluxo de import pra cadastrar categoria à parte.
 * Erro-como-dado: categoria que falhar ao criar só some do mapa de retorno — o item
 * correspondente cai em "Sem categoria" (`resolveCreateOverrides`), nunca derruba o commit.
 */
async function createSuggestedCategories(analyzed: ImportFileEntry[]): Promise<Map<string, string>> {
  const toCreate = collectCategoriesToCreate(analyzed);
  const createdIdByKey = new Map<string, string>();
  if (toCreate.size === 0) return createdIdByKey;

  await Promise.all(
    [...toCreate.entries()].map(async ([key, { name, type }]) => {
      try {
        const result = await createCategoryAction({ name, type, color: CATEGORY_TYPE_DEFAULT_COLOR[type] });
        if (result.success) createdIdByKey.set(key, result.data.id);
      } catch {
        // segue sem essa categoria — item cai em "Sem categoria" (resolveCreateOverrides).
      }
    }),
  );

  return createdIdByKey;
}

/**
 * Estado do importador multi-arquivo — generalizado por `target` (conta OU cartão,
 * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1").
 * Front itera as Server Actions por arquivo — 1 `previewImportAction` + 1
 * `commitImportAction` cada, sem action batch nova.
 *
 * `categoryNameToId` (Refino 3) — nome (lowercase) → id das categorias do
 * usuário, usado pra PRÉ-selecionar a categoria sugerida (`categoryName`,
 * resolvida por histórico ou pela IA no backend) no select por item da
 * prévia. Sem match, o item nasce pré-selecionado como "Criar: <nome>" em
 * vez de "Sem categoria" (sentinela `createCategoryOverrideValue`,
 * `import-file-utils.ts`) — 1 clique aceita a sugestão e cria a categoria no
 * `confirm()`, nunca inventa um id sem o usuário confirmar.
 */
export function useImportFiles(target: ImportTarget, categoryNameToId: Map<string, string>) {
  const queryClient = useQueryClient();
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
   * `ImportPreviewPanel`). `categoryId: null` = "Sem categoria" explícito;
   * pode ser um id real OU o sentinela "Criar: <nome>" (`isCreateCategoryOverride`)
   * — repassado como veio, resolvido só no `confirm()`.
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
          // Sem categoria sugerida: null ("Sem categoria"). Com sugestão que casa com uma
          // categoria real do usuário: pré-seleciona o id. Com sugestão sem match: pré-seleciona
          // o sentinela "Criar: <nome>" — 1 clique aceita, sem cair em "Sem categoria" à toa.
          const categoryOverrides = preview.novos.map((item) => {
            if (!item.categoryName) return null;
            const existingId = categoryNameToId.get(item.categoryName.toLowerCase());
            return existingId ?? createCategoryOverrideValue(item.categoryName);
          });

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

    // Cria as categorias sugeridas (sentinela "Criar: <nome>") ANTES do commit, deduplicadas
    // entre todos os arquivos — o commit de cada arquivo já usa o id recém-criado.
    const createdIdByKey = await createSuggestedCategories(analyzed);
    if (createdIdByKey.size > 0) {
      void queryClient.invalidateQueries({ queryKey: TRANSACTIONS_REFERENCE_DATA_QUERY_KEY });
    }

    const patches = await Promise.all(
      analyzed.map(async (entry): Promise<EntryPatch> => {
        try {
          const categoryOverrides = resolveCreateOverrides(entry, createdIdByKey);
          const transactions = applyCategoryOverrides(entry.parsed!, entry.novosParsedIndexes, categoryOverrides);
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
