import type { ImportParseResult } from "../types";
import { parseOfx } from "./ofx-parser";
import { parseCsv } from "./csv-parser";
import { parseXlsx } from "./xlsx-parser";
import { parsePdfStatement } from "./pdf-parser";

/**
 * Registry de parsers por formato de arquivo
 * (docs/superpowers/specs/2026-07-08-import-multiformato-design.md).
 * Detecção por EXTENSÃO do nome do arquivo (não conteúdo/MIME) — simples e
 * suficiente pros formatos suportados hoje (OFX, CSV, XLSX, PDF).
 */
function detectExtension(fileName: string): string {
  const trimmed = fileName.trim().toLowerCase();
  const dotIndex = trimmed.lastIndexOf(".");
  return dotIndex === -1 ? "" : trimmed.slice(dotIndex + 1);
}

/**
 * Ponto único de entrada do parse. `content` é texto (utf-8, `file.text()`
 * no front) pros formatos de texto (OFX, CSV) e base64 (`file.arrayBuffer()`
 * no front, ver `import-modal.tsx`) pro XLSX, que é binário — cada parser
 * sabe o encoding que espera (ver comentário em `xlsx-parser.ts`).
 *
 * `.xls` (binário legado, BIFF) NÃO é lido — `exceljs` só suporta o formato
 * moderno Open XML (`.xlsx`). Reportado como erro claro em vez de tentar e
 * falhar sem explicação (instrução do dono: nada de puxar outra lib só pra
 * cobrir esse caso raro).
 *
 * `.pdf` também chega em base64 (binário) — extração via Gemini
 * (`pdf-parser.ts`), mesmo racional do `financing-parser.ts` de
 * `modules/telegram`.
 */
export async function parseImportFile(fileName: string, content: string): Promise<ImportParseResult> {
  const extension = detectExtension(fileName);

  if (extension === "ofx") return parseOfx(content);
  if (extension === "csv") return parseCsv(content);
  if (extension === "xlsx") return parseXlsx(content);
  if (extension === "pdf") return parsePdfStatement(content);
  if (extension === "xls") {
    return {
      transactions: [],
      errors: [
        {
          snippet: fileName,
          reason: 'Formato ".xls" (binário antigo) não suportado — exporte o extrato como .xlsx ou .csv.',
        },
      ],
    };
  }

  return {
    transactions: [],
    errors: [{ snippet: fileName, reason: `Formato de arquivo não suportado: ".${extension || "?"}"` }],
  };
}
