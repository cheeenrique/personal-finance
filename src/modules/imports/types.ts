import type { TransactionType } from "@/generated/prisma/enums";

/** Todo parser de import só produz lançamento simples (CREDIT/DEBIT) — nunca TRANSFER/CARD_PAYMENT (ver parsers/*.ts). */
export type ImportTransactionType = Extract<TransactionType, "INCOME" | "EXPENSE">;

/**
 * Contrato comum de todo parser de extrato (OFX, CSV, e formatos futuros —
 * docs/superpowers/specs/2026-07-08-import-multiformato-design.md). `fitId`
 * é `null` quando o formato não tem identificador único de transação (CSV
 * nunca tem; OFX só no raro bloco sem `<FITID>`) — o módulo cai num fallback
 * de dedup por `(accountId, date, amount, description)` nesse caso
 * (docs/03-DATABASE.md, "Importação de Extrato OFX").
 */
export type ParsedTransaction = {
  fitId: string | null;
  date: Date;
  /** Decimal string, sempre positivo (`abs`) — o sinal vem só do `type`, nunca do valor cru do arquivo. */
  amount: string;
  type: ImportTransactionType;
  description: string;
};

/** Uma linha/bloco do arquivo que falhou o parse — trecho cru + motivo, pro usuário identificar o lançamento no arquivo original. */
export type ImportParseError = {
  snippet: string;
  reason: string;
};

export type ImportParseResult = {
  transactions: ParsedTransaction[];
  errors: ImportParseError[];
};

/** Item "novo" da prévia — ainda não gravado (ver service.ts `previewImport`). */
export type ImportPreviewItem = {
  date: Date;
  amount: string;
  type: ImportTransactionType;
  description: string;
  /** Sugestão de `transactionService.lastCategoryForDescription` — `null` quando não há histórico (nunca inventada). */
  categoryName: string | null;
};

/** Resultado da prévia (docs entregues pelo coordenador) — nada gravado ainda. */
export type ImportPreview = {
  total: number;
  novos: ImportPreviewItem[];
  duplicados: number;
  erros: ImportParseError[];
};

/**
 * Retorno de `previewImport` — a prévia exibida + as transações JÁ parseadas.
 * O commit reaproveita `transactions` em vez de reparsear o arquivo (PDF é
 * extraído por LLM: reparsear custa uma 2ª chamada Gemini, lenta e não
 * determinística — a prévia mostrada poderia divergir do que é gravado). O
 * front carrega `transactions` da prévia até o commit.
 */
export type ImportPreviewResult = {
  preview: ImportPreview;
  transactions: ParsedTransaction[];
};

/** Resultado da confirmação — o que de fato foi gravado. */
export type ImportCommitResult = {
  imported: number;
  duplicados: number;
  erros: ImportParseError[];
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
