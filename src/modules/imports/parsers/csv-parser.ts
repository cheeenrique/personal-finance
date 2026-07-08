import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { startOfDaySP } from "@/lib/date/calendar-sp";
import type { ImportParseError, ImportParseResult, ImportTransactionType, ParsedTransaction } from "../types";

/**
 * Parser de CSV de extrato (docs/superpowers/specs/2026-07-08-import-multiformato-design.md,
 * "CSV (determinístico, sem IA)"). Função PURA, sem lib externa — layout
 * simples o bastante pra parse manual (split por delimitador, sem campos com
 * delimitador embutido dentro de aspas).
 *
 * CSV nunca tem `fitId` (a coluna não existe no formato) — todo item cai no
 * fallback de dedup por `(accountId, date, amount, description)` já
 * endurecido em `repository.ts`/`service.ts`.
 */

const DELIMITERS = [",", ";", "\t"] as const;

const DATE_HEADERS = ["data", "date"];
const AMOUNT_HEADERS = ["valor", "amount", "quantia"];
const DESCRIPTION_HEADERS = ["descricao", "historico", "memo", "description"];
const TYPE_HEADERS = ["tipo", "type"];

type ColumnIndexes = {
  date: number;
  amount: number;
  description: number;
  type: number | null;
};

/** Remove acentuação e normaliza caixa — casa "descrição"/"histórico" (pt-BR) contra a mesma lista de headers em ASCII. */
function normalizeHeader(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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

/**
 * TODO (fase futura, docs/superpowers/specs/2026-07-08-import-multiformato-design.md
 * "Profundidade do mapeamento de coluna"): quando os headers obrigatórios não
 * batem com nenhum alias conhecido, hoje só reportamos erro — fase futura
 * adiciona passo de mapeamento manual de coluna na UI em vez de rejeitar.
 */
function resolveColumns(headerCells: string[]): ColumnIndexes | null {
  const normalized = headerCells.map(normalizeHeader);
  const dateIndex = normalized.findIndex((cell) => DATE_HEADERS.includes(cell));
  const amountIndex = normalized.findIndex((cell) => AMOUNT_HEADERS.includes(cell));
  const descriptionIndex = normalized.findIndex((cell) => DESCRIPTION_HEADERS.includes(cell));
  if (dateIndex === -1 || amountIndex === -1 || descriptionIndex === -1) return null;

  const typeIndex = normalized.findIndex((cell) => TYPE_HEADERS.includes(cell));
  return { date: dateIndex, amount: amountIndex, description: descriptionIndex, type: typeIndex === -1 ? null : typeIndex };
}

const DATE_DMY_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const DATE_YMD_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return startOfDaySP(year, month, day);
}

/** `dd/mm/yyyy` ou `yyyy-mm-dd` → meia-noite America/Sao_Paulo (mesmo destino do OFX, `startOfDaySP`). */
function parseCsvDate(raw: string): Date | null {
  const trimmed = raw.trim();

  const dmy = trimmed.match(DATE_DMY_REGEX);
  if (dmy) return buildDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));

  const ymd = trimmed.match(DATE_YMD_REGEX);
  if (ymd) return buildDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  return null;
}

/**
 * pt-BR (`1.234,56`, milhar com ponto e decimal com vírgula) e en
 * (`1234.56`) — presença de vírgula decide o formato. Sinal/parênteses
 * removidos antes de normalizar e devolvidos como `isNegative` (o valor
 * final é sempre positivo, mesmo contrato do `parseOfxAmount`).
 */
function parseCsvAmount(raw: string): { value: string; isNegative: boolean } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isNegative = trimmed.startsWith("-") || /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/^[-+]/, "").replace(/[()]/g, "");
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  return { value: new Prisma.Decimal(normalized).toFixed(2), isNegative };
}

/** Sinal do valor decide o tipo; coluna `tipo`/`type` explícita (DEBIT/CREDIT ou EXPENSE/INCOME) tem prioridade quando presente. */
function resolveType(isNegative: boolean, typeRaw: string | null): ImportTransactionType {
  const normalized = typeRaw?.trim().toUpperCase();
  if (normalized === "DEBIT" || normalized === "EXPENSE") return TransactionType.EXPENSE;
  if (normalized === "CREDIT" || normalized === "INCOME") return TransactionType.INCOME;
  return isNegative ? TransactionType.EXPENSE : TransactionType.INCOME;
}

function parseRow(
  line: string,
  delimiter: string,
  columns: ColumnIndexes,
): { transaction: ParsedTransaction } | { error: ImportParseError } {
  const cells = splitLine(line, delimiter);
  const snippet = line.trim();

  const dateRaw = cells[columns.date];
  const date = dateRaw ? parseCsvDate(dateRaw) : null;
  if (!date) return { error: { snippet, reason: `Data inválida: "${dateRaw ?? ""}"` } };

  const amountRaw = cells[columns.amount];
  const parsedAmount = amountRaw ? parseCsvAmount(amountRaw) : null;
  if (!parsedAmount) return { error: { snippet, reason: `Valor inválido: "${amountRaw ?? ""}"` } };

  const description = cells[columns.description]?.trim();
  if (!description) return { error: { snippet, reason: "Linha sem descrição" } };

  const typeRaw = columns.type !== null ? (cells[columns.type] ?? null) : null;
  const type = resolveType(parsedAmount.isNegative, typeRaw);

  return { transaction: { fitId: null, date, amount: parsedAmount.value, type, description } };
}

export function parseCsv(content: string): ImportParseResult {
  const lines = content.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { transactions: [], errors: [{ snippet: "", reason: "Arquivo CSV vazio" }] };
  }

  const headerLine = lines[0]!;
  const delimiter = detectDelimiter(headerLine);
  const headerCells = splitLine(headerLine, delimiter);
  const columns = resolveColumns(headerCells);

  if (!columns) {
    return {
      transactions: [],
      errors: [
        {
          snippet: headerLine,
          reason: `Não foi possível identificar as colunas de data/valor/descrição. Headers encontrados: ${headerCells.join(", ")}`,
        },
      ],
    };
  }

  const transactions: ParsedTransaction[] = [];
  const errors: ImportParseError[] = [];

  for (const line of lines.slice(1)) {
    const result = parseRow(line, delimiter, columns);
    if ("error" in result) errors.push(result.error);
    else transactions.push(result.transaction);
  }

  return { transactions, errors };
}
