import type { ImportPreview, ImportCommitResult, ParsedTransaction } from "@/modules/imports/types";

export type ImportFileReadStatus = "reading" | "ready" | "error";

/**
 * Estado de UM arquivo dentro do dropzone multi-arquivo, do drop até o
 * commit. O front itera as Server Actions por arquivo (1 preview + 1 commit
 * cada — sem action batch nova, decisão do coordenador) e agrega os
 * resultados na UI (`import-file-utils.ts`, `aggregatePreview`/
 * `aggregateCommit`). `content` guarda o texto/base64 já lido do arquivo (só a
 * prévia usa — o commit reaproveita `parsed`, as transações já extraídas pela
 * prévia, sem reparsear o arquivo).
 */
export type ImportFileEntry = {
  id: string;
  file: File;
  name: string;
  size: number;
  /** Status da LEITURA client-side (antes de qualquer chamada ao backend): extensão suportada + `file.text()`/base64 ok. */
  status: ImportFileReadStatus;
  content: string | null;
  /** Motivo de falha na leitura (extensão não suportada, erro do FileReader) — nesse caso a action nunca chega a ser chamada. */
  error: string | null;
  /** Preenchido depois de "Analisar arquivos" (`previewImportAction`). */
  preview: ImportPreview | null;
  /** Transações extraídas na prévia — reaproveitadas no commit (evita 2º parse/chamada Gemini). */
  parsed: ParsedTransaction[] | null;
  previewError: string | null;
  /** Preenchido depois de "Confirmar importação" (`commitImportAction`). */
  commit: ImportCommitResult | null;
  commitError: string | null;
};

export type ImportStep = "select" | "preview" | "result";
