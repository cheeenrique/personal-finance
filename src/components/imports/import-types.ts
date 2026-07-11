import type { ImportPreview, ImportCommitResult, ParsedTransaction } from "@/modules/imports/types";

export type ImportFileReadStatus = "reading" | "ready" | "error";

/**
 * Estado de UM arquivo dentro do dropzone multi-arquivo (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
 * "Frontend") — generalizado por `target` (`ImportModal`/`useImportFiles`, não por
 * arquivo). `hasPassword`/`password`: só relevante pra target CARTÃO + arquivo PDF
 * (fatura cifrada) — conta nunca usa (`ImportDropzone allowPassword={target.kind==="card"}`).
 */
export type ImportFileEntry = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: ImportFileReadStatus;
  content: string | null;
  error: string | null;
  hasPassword: boolean;
  password: string;
  preview: ImportPreview | null;
  parsed: ParsedTransaction[] | null;
  previewError: string | null;
  commit: ImportCommitResult | null;
  commitError: string | null;
};

export type ImportStep = "select" | "preview" | "result";
