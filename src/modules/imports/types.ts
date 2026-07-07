import type { TransactionType } from "@/generated/prisma/enums";

/** OFX só produz lançamento de conta bancária (CREDIT/DEBIT) — nunca TRANSFER/CARD_PAYMENT (ver ofx-parser.ts). */
export type OfxTransactionType = Extract<TransactionType, "INCOME" | "EXPENSE">;

/**
 * Um `<STMTTRN>` já parseado (ver `ofx-parser.ts`, função pura). `fitId` é
 * `null` só no raro caso de bloco sem `<FITID>` no arquivo — o módulo cai num
 * fallback de dedup por `(accountId, date, amount, description)` nesse caso
 * (docs/03-DATABASE.md, "Importação de Extrato OFX").
 */
export type ParsedOfxTransaction = {
  fitId: string | null;
  date: Date;
  /** Decimal string, sempre positivo (`abs`) — o sinal vem só do `type` (CREDIT/DEBIT), nunca do valor cru do OFX. */
  amount: string;
  type: OfxTransactionType;
  description: string;
};

/** Um bloco `<STMTTRN>` que falhou o parse — trecho cru + motivo, pro usuário identificar o lançamento no arquivo original. */
export type OfxParseError = {
  snippet: string;
  reason: string;
};

export type OfxParseResult = {
  transactions: ParsedOfxTransaction[];
  errors: OfxParseError[];
};

/** Item "novo" da prévia — ainda não gravado (ver service.ts `previewOfxImport`). */
export type OfxPreviewItem = {
  date: Date;
  amount: string;
  type: OfxTransactionType;
  description: string;
  /** Sugestão de `transactionService.lastCategoryForDescription` — `null` quando não há histórico (nunca inventada). */
  categoryName: string | null;
};

/** Resultado da prévia (docs entregues pelo coordenador) — nada gravado ainda. */
export type OfxImportPreview = {
  total: number;
  novos: OfxPreviewItem[];
  duplicados: number;
  erros: OfxParseError[];
};

/** Resultado da confirmação — o que de fato foi gravado. */
export type OfxImportCommitResult = {
  imported: number;
  duplicados: number;
  erros: OfxParseError[];
};

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
