import type { ImportParseResult } from "../types";
import { parseOfx } from "./ofx-parser";
import { parseCsv } from "./csv-parser";

/**
 * Registry de parsers por formato de arquivo
 * (docs/superpowers/specs/2026-07-08-import-multiformato-design.md).
 * Detecção por EXTENSÃO do nome do arquivo (não conteúdo/MIME) — simples e
 * suficiente pros formatos suportados hoje (OFX, CSV). Fases futuras
 * (XLSX/PDF) adicionam entradas aqui, sem mexer no pipeline de
 * preview/commit (`service.ts`).
 */
function detectExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex === -1 ? "" : trimmed.slice(dotIndex + 1);
}

/** Ponto único de entrada do parse — todo `fileContent` chega aqui já decodificado (utf-8) pelo caller (`file.text()` no front). */
export function parseImportFile(fileName: string, content: string): ImportParseResult {
  const extension = detectExtension(fileName);

  if (extension === "ofx") return parseOfx(content);
  if (extension === "csv") return parseCsv(content);

  return {
    transactions: [],
    errors: [{ snippet: fileName, reason: `Formato de arquivo não suportado: ".${extension || "?"}"` }],
  };
}
