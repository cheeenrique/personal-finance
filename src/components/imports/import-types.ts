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
  /**
   * Índice em `parsed` correspondente a cada item de `preview.novos`, na mesma
   * ordem (`import-file-utils.ts` `mapNovosToParsedIndexes`) — `parsed` inclui
   * duplicatas e vem na ordem original do arquivo, `preview.novos` é a
   * subsequência sem duplicatas mostrada na prévia. `null` até a prévia carregar.
   */
  novosParsedIndexes: number[] | null;
  /**
   * Categoria escolhida pelo usuário por item de `preview.novos` (Refino 3,
   * select por linha na prévia) — mesmo índice de `novosParsedIndexes`.
   * `null` = "Sem categoria" (sem override, cai no fallback de histórico do
   * backend de qualquer forma — `modules/imports/service.ts` `resolveCommitCategoryId`).
   * Inicializado no `analyze()` com a categoria sugerida (`categoryName`) quando
   * ela casar com uma categoria existente do usuário.
   */
  categoryOverrides: (string | null)[];
};

export type ImportStep = "select" | "preview" | "result";
