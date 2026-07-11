import type { TransactionType } from "@/generated/prisma/enums";

/**
 * Alvo de uma importação — conta (extrato) OU cartão (fatura,
 * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1").
 * Costuras target-específicas: dedup de conta usa `(data,valor,descrição)`, cartão usa só
 * `(data,valor)` (fatura não tem `fitId`, ver `service.ts` `buildFallbackKey`); insert de
 * cartão grava `cardId` set + `accountId=null` (ver `repository.ts` `insertMany`).
 */
export type ImportTarget = { kind: "account"; accountId: string } | { kind: "card"; cardId: string };

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
  /**
   * Categoria escolhida pelo usuário na prévia (override) — opcional, `undefined`/`null` nos
   * parsers (nunca preenchida no parse). Só o front, no commit, manda um valor não-nulo aqui.
   * `commitImport` valida ownership (`categoryRepository.findOwnedIds`) antes de usar — se não
   * pertencer ao userId, cai no fallback de histórico (`resolveCategoryId`) como se não
   * tivesse vindo nada (docs/10-AUTH.md, isolamento por userId).
   */
  categoryId?: string | null;
  /**
   * Sugestão de categoria da IA a partir do estabelecimento/descrição — só
   * `card-invoice-parser.ts` preenche isso (a IA infere pela FATURA, ex.: "AZUL SEGUROS" →
   * "Seguros"); `pdf-parser.ts` de extrato nunca pede no prompt, então fica `undefined` nesse
   * caso (contrato de extrato inalterado). `previewImport` (`service.ts`, `resolveCategoryName`)
   * tenta casar isso com uma categoria REAL do usuário antes de cair no fallback de histórico —
   * nunca inventa categoria nova, só sugere se casar.
   */
  suggestedCategoryName?: string | null;
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
