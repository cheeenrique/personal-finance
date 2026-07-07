import { Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { parseInSaoPaulo } from "@/lib/date/timezone";
import type { OfxParseError, OfxParseResult, OfxTransactionType, ParsedOfxTransaction } from "./types";

/**
 * Parser de extrato OFX (SGML — ver docs/03-DATABASE.md, "Importação de
 * Extrato OFX"). Função PURA: recebe o conteúdo do arquivo já decodificado
 * (utf-8, decidido pelo caller — o front lê com `file.text()`), nenhum I/O
 * aqui.
 *
 * OFX v1 (SGML, formato real dos extratos bancários brasileiros) omite tag de
 * fechamento nos elementos-folha (`<TRNTYPE>DEBIT`, sem `</TRNTYPE>`) — só o
 * container `<STMTTRN>...</STMTTRN>` tem abertura/fechamento explícitos. Por
 * isso cada campo é extraído por regex "valor até o próximo `<` ou fim de
 * linha", nunca por parser XML (que quebraria em blocos sem fechamento).
 */

const STMTTRN_BLOCK_REGEX = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;

function extractField(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>\\s*([^<\r\n]*)`, "i"));
  if (!match) return null;

  const value = match[1]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

/** `YYYYMMDD` (com ou sem hora/timezone atrás, ex. `YYYYMMDDHHMMSS[-3:BRT]`) → meia-noite em America/Sao_Paulo. */
function parseOfxDate(raw: string): Date | null {
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return parseInSaoPaulo(new Date(year, month - 1, day, 0, 0, 0, 0));
}

/** Sempre positivo — o sinal do valor no arquivo é ignorado, o tipo (CREDIT/DEBIT) já carrega essa informação. */
function parseOfxAmount(raw: string): string | null {
  const normalized = raw.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  return new Prisma.Decimal(normalized).abs().toFixed(2);
}

function parseOfxType(raw: string): OfxTransactionType | null {
  const normalized = raw.trim().toUpperCase();
  if (normalized === "CREDIT") return TransactionType.INCOME;
  if (normalized === "DEBIT") return TransactionType.EXPENSE;
  return null;
}

function parseBlock(block: string): { transaction: ParsedOfxTransaction } | { error: OfxParseError } {
  const snippet = block.trim();

  const trnamtRaw = extractField(block, "TRNAMT");
  if (!trnamtRaw) return { error: { snippet, reason: "Bloco sem valor (TRNAMT)" } };

  const dtpostedRaw = extractField(block, "DTPOSTED");
  if (!dtpostedRaw) return { error: { snippet, reason: "Bloco sem data (DTPOSTED)" } };

  const amount = parseOfxAmount(trnamtRaw);
  if (!amount) return { error: { snippet, reason: `Valor inválido: "${trnamtRaw}"` } };

  const date = parseOfxDate(dtpostedRaw);
  if (!date) return { error: { snippet, reason: `Data inválida: "${dtpostedRaw}"` } };

  const trntypeRaw = extractField(block, "TRNTYPE");
  if (!trntypeRaw) return { error: { snippet, reason: "Bloco sem tipo (TRNTYPE)" } };

  const type = parseOfxType(trntypeRaw);
  if (!type) return { error: { snippet, reason: `Tipo de transação não suportado: "${trntypeRaw}"` } };

  const memo = extractField(block, "MEMO");
  if (!memo) return { error: { snippet, reason: "Bloco sem descrição (MEMO)" } };

  return {
    transaction: {
      fitId: extractField(block, "FITID"),
      date,
      amount,
      type,
      description: memo,
    },
  };
}

export function parseOfx(content: string): OfxParseResult {
  const blocks = content.match(STMTTRN_BLOCK_REGEX) ?? [];

  const transactions: ParsedOfxTransaction[] = [];
  const errors: OfxParseError[] = [];

  for (const block of blocks) {
    const result = parseBlock(block);
    if ("error" in result) errors.push(result.error);
    else transactions.push(result.transaction);
  }

  return { transactions, errors };
}
