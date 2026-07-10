import { TransactionType } from "@/generated/prisma/enums";
import type { ImportPreviewItem } from "@/modules/imports/types";
import type { ImportFileEntry } from "./import-types";

/** Extensões aceitas pelo dropzone — espelha `modules/imports/parsers/index.ts` (`.xls` é aceito e enviado; o backend devolve erro claro pro binário legado, não bloqueamos no client). */
export const ACCEPTED_EXTENSIONS = [".ofx", ".csv", ".xls", ".xlsx", ".pdf"] as const;

/** Extensões binárias — lidas via `file.arrayBuffer()` + base64 em vez de `file.text()` (XLSX/PDF não são texto; `parsers/index.ts` espera base64 pra esses formatos). */
const BINARY_EXTENSIONS = [".xls", ".xlsx", ".pdf"];

function normalizedName(fileName: string): string {
  return fileName.trim().toLowerCase();
}

export function isSupportedImportFile(fileName: string): boolean {
  const lower = normalizedName(fileName);
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function isBinaryImportFile(fileName: string): boolean {
  const lower = normalizedName(fileName);
  return BINARY_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function isPdfImportFile(fileName: string): boolean {
  return normalizedName(fileName).endsWith(".pdf");
}

/** `ArrayBuffer` → base64 sem passar por `FileReader` (a `data:` URL do `FileReader` traria o prefixo `data:<mime>;base64,` junto). */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

/** OFX/CSV são texto (`file.text()`); XLS/XLSX/PDF é binário (base64) — cada parser em `modules/imports/parsers/` espera o encoding certo pro seu formato. */
export function readEntryContent(file: File): Promise<string> {
  return isBinaryImportFile(file.name) ? fileToBase64(file) : file.text();
}

/** Entrada inicial de um arquivo recém-solto/selecionado — extensão inválida já nasce em erro, sem chamar o backend. */
export function buildFileEntry(file: File): ImportFileEntry {
  const supported = isSupportedImportFile(file.name);

  return {
    id: crypto.randomUUID(),
    file,
    name: file.name,
    size: file.size,
    status: supported ? "reading" : "error",
    content: null,
    error: supported ? null : "Formato não suportado — use OFX, CSV, XLS, XLSX ou PDF.",
    preview: null,
    previewError: null,
    commit: null,
    commitError: null,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Soma de `novos` de UM tipo (INCOME/EXPENSE) — insumo dos 2 blocos "Entradas/Saídas a importar" (`import-preview.tsx`). */
function sumNovosByType(novos: ImportPreviewItem[], type: TransactionType): number {
  return novos.filter((item) => item.type === type).reduce((sum, item) => sum + Number(item.amount), 0);
}

/**
 * Totais agregados de todos os arquivos já analisados — usado nos KPIs do
 * step preview (total/novos/duplicados, handoff "Step preview") + nos 2
 * blocos "Entradas/Saídas a importar" (soma de `novos` por tipo, mesmo motivo
 * de exibir de antemão o impacto no fluxo de caixa antes de confirmar).
 */
export function aggregatePreview(entries: ImportFileEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      if (!entry.preview) return totals;
      return {
        total: totals.total + entry.preview.total,
        novos: totals.novos + entry.preview.novos.length,
        duplicados: totals.duplicados + entry.preview.duplicados,
        incomeTotal: totals.incomeTotal + sumNovosByType(entry.preview.novos, TransactionType.INCOME),
        expenseTotal: totals.expenseTotal + sumNovosByType(entry.preview.novos, TransactionType.EXPENSE),
      };
    },
    { total: 0, novos: 0, duplicados: 0, incomeTotal: 0, expenseTotal: 0 },
  );
}

/** Totais agregados de todos os arquivos já confirmados — usado no KPI do step result. */
export function aggregateCommit(entries: ImportFileEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      if (!entry.commit) return totals;
      return {
        imported: totals.imported + entry.commit.imported,
        duplicados: totals.duplicados + entry.commit.duplicados,
        erros: totals.erros + entry.commit.erros.length,
      };
    },
    { imported: 0, duplicados: 0, erros: 0 },
  );
}
