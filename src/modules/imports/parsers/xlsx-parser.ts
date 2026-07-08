import ExcelJS from "exceljs";
import type { ImportParseResult } from "../types";
import { parseTabular } from "./tabular";

/**
 * Parser de XLSX de extrato (docs/superpowers/specs/2026-07-08-import-multiformato-design.md,
 * "XLS/XLSX (determinístico)"). Lê a 1ª aba com `exceljs` → matriz de células
 * (`string[][]`) → delega o mapeamento de coluna/normalização pro MESMO
 * `parseTabular` do CSV (reuso, não duplicar). I/O (leitura do buffer,
 * `exceljs`) isolado aqui; `tabular.ts` continua puro.
 *
 * Só `.xlsx` (Open XML) — `exceljs` não lê o binário legado `.xls` (BIFF),
 * ver `parsers/index.ts`.
 *
 * `content` chega em base64 (não texto — XLSX é binário). O caller
 * (`parsers/index.ts`) decide o encoding por extensão; front lê com
 * `file.arrayBuffer()` em vez de `file.text()` pra esse formato
 * (`import-modal.tsx`).
 */

/** Serial de data do Excel já vem como `Date` UTC do `exceljs` — formata como `yyyy-mm-dd` (um dos formatos aceitos por `parseTabularDate`), sem reconverter timezone (o dia-calendário já é o correto). */
function formatCellDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Célula formatada como texto simples pro `parseTabular` — cobre os tipos de valor mais comuns em extrato (texto, número, data, fórmula com resultado, rich text). */
function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatCellDate(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "object" && "richText" in value) return value.richText.map((part) => part.text).join("");
  if (typeof value === "object" && "result" in value) return cellToString(value.result ?? "");
  if (typeof value === "object" && "text" in value) return String(value.text);
  return String(value);
}

function worksheetToMatrix(worksheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      cells.push(cellToString(cell.value).trim());
    });
    rows.push(cells);
  });
  return rows;
}

/** `base64Content`: conteúdo binário do arquivo `.xlsx` codificado em base64 (ver contrato no topo do arquivo). */
export async function parseXlsx(base64Content: string): Promise<ImportParseResult> {
  const buffer = Buffer.from(base64Content, "base64");

  const workbook = new ExcelJS.Workbook();
  try {
    // `exceljs/index.d.ts` faz `declare interface Buffer extends ArrayBuffer {}`
    // no escopo global — polui o `Buffer` ambiente do @types/node (bug
    // conhecido da lib), tornando o tipo nominal "Buffer" inconsistente
    // dentro deste arquivo. Cast via `Parameters<...>` pega o tipo exato
    // esperado por `load` estruturalmente, sem depender do identificador
    // "Buffer" ambíguo. Runtime idêntico (mesmo `Buffer` do Node em ambos os
    // lados) — só contorna a inconsistência de tipos da lib.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch (error) {
    // Mesmo padrão de log de erro inesperado de `actions.ts` (`toActionError`)
    // — o motivo do arquivo estar ilegível não é exposto ao usuário (mensagem
    // genérica abaixo), mas fica no log do servidor pra debug.
    console.error("[modules/imports] falha ao ler XLSX", error);
    return {
      transactions: [],
      errors: [
        {
          snippet: "",
          reason: "Não foi possível ler o arquivo XLSX (arquivo corrompido ou em formato inválido).",
        },
      ],
    };
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    return { transactions: [], errors: [{ snippet: "", reason: "Planilha sem nenhuma aba" }] };
  }

  return parseTabular(worksheetToMatrix(worksheet));
}
