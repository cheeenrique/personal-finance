import { toZonedTime } from "date-fns-tz";
import { TransactionType } from "@/generated/prisma/enums";
import { TIMEZONE } from "@/lib/date/timezone";
import { reportRepository, type TransactionCsvRow } from "./repository";
import type { CsvFilterInput } from "./schemas";

const CSV_HEADER = ["Data", "Descrição", "Tipo", "Categoria", "Conta/Cartão", "Valor", "Pago"] as const;

const TYPE_LABEL: Record<TransactionType, string> = {
  [TransactionType.INCOME]: "Receita",
  [TransactionType.EXPENSE]: "Despesa",
  [TransactionType.TRANSFER]: "Transferência",
  [TransactionType.CARD_PAYMENT]: "Pagamento de Fatura",
};

/**
 * Escapa um campo pro formato CSV (RFC 4180): se contiver vírgula, aspas ou
 * quebra de linha, envolve em aspas duplas e duplica cada aspa interna.
 * Implementado localmente (sem lib compartilhada) — instrução explícita da
 * task; é a única ocorrência no projeto até agora (sem cruzar o limiar de
 * extração da rule 02-dry-kiss-yagni).
 */
function escapeCsvField(value: string): string {
  const needsQuoting = /[",\n\r]/.test(value);
  if (!needsQuoting) return value;

  return `"${value.replace(/"/g, '""')}"`;
}

/** Data no formato DD/MM/YYYY, em America/Sao_Paulo (docs/01-STACK.md, timezone fixo). */
function formatDateSP(date: Date): string {
  const zoned = toZonedTime(date, TIMEZONE);
  const day = String(zoned.getDate()).padStart(2, "0");
  const month = String(zoned.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${zoned.getFullYear()}`;
}

function toCsvRow(transaction: TransactionCsvRow): string {
  const source = transaction.account?.name ?? transaction.card?.name ?? "—";

  const fields = [
    formatDateSP(transaction.date),
    transaction.description,
    TYPE_LABEL[transaction.type],
    transaction.category?.name ?? "—",
    source,
    transaction.amount.toFixed(2),
    transaction.isPaid ? "Sim" : "Não",
  ];

  return fields.map(escapeCsvField).join(",");
}

/**
 * Export CSV das transactions do usuário — extrato bruto, sem exclusão de
 * Transfer/CARD_PAYMENT (docs/28-REPORTS.md, "Exportação"). Linhas terminadas
 * em CRLF (RFC 4180).
 */
async function exportTransactionsCSV(userId: string, filters: CsvFilterInput): Promise<string> {
  const transactions = await reportRepository.listForCsv(userId, filters);

  const lines = [CSV_HEADER.join(","), ...transactions.map(toCsvRow)];
  return lines.join("\r\n");
}

export const reportCsv = { exportTransactionsCSV };
