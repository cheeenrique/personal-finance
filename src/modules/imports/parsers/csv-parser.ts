import type { ImportParseResult } from "../types";
import { parseTabular } from "./tabular";

/**
 * Parser de CSV de extrato (docs/superpowers/specs/2026-07-08-import-multiformato-design.md,
 * "CSV (determinístico, sem IA)"). Função PURA, sem lib externa — layout
 * simples o bastante pra parse manual (split por delimitador, sem campos com
 * delimitador embutido dentro de aspas).
 *
 * Só cuida do que é específico de CSV (delimitador + split de linha em
 * células); o mapeamento de coluna, parsing de data/valor/tipo é comum a
 * qualquer formato tabular e vive em `tabular.ts` (reusado pelo XLSX).
 *
 * CSV nunca tem `fitId` (a coluna não existe no formato) — todo item cai no
 * fallback de dedup por `(accountId, date, amount, description)` já
 * endurecido em `repository.ts`/`service.ts`.
 */

const DELIMITERS = [",", ";", "\t"] as const;

/** Delimitador = o que mais ocorre na linha de header, dentre `,` `;` tab. */
function detectDelimiter(headerLine: string): string {
  let best: string = DELIMITERS[0];
  let bestCount = -1;
  for (const delimiter of DELIMITERS) {
    const count = headerLine.split(delimiter).length - 1;
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function splitLine(line: string, delimiter: string): string[] {
  return line.split(delimiter).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1").trim());
}

export function parseCsv(content: string): ImportParseResult {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { transactions: [], errors: [{ snippet: "", reason: "Arquivo CSV vazio" }] };
  }

  const delimiter = detectDelimiter(lines[0]!);
  const rows = lines.map((line) => splitLine(line, delimiter));

  return parseTabular(rows);
}
