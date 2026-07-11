import { prisma } from "@/lib/db/client";
import { Prisma } from "@/generated/prisma/client";
import type { TransactionType } from "@/generated/prisma/enums";
import type { ImportTarget } from "./types";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (mesmo padrão de `modules/cards/repository.ts`, ver service.ts `commitImport`). */
type Db = Prisma.TransactionClient;

export type CommitItem = {
  fitId: string | null;
  date: Date;
  amount: string;
  type: TransactionType;
  description: string;
  categoryId: string | null;
};

export type FallbackRow = { date: Date; amount: string; description: string };

/**
 * Acesso a dados do módulo imports. SEMPRE escopado por `userId` + `deletedAt: null`
 * (docs/03-DATABASE.md, "Princípio Principal"). Generalizado por `ImportTarget`
 * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1") —
 * conta usa `fitId` (OFX); cartão NUNCA tem `fitId` (fatura em PDF não traz identificador
 * único de transação, mesma limitação que extrato em PDF já tinha) — `findExistingFitIds`
 * devolve `Set` vazio pra `target.kind === "card"` sem tocar o banco.
 */

/** `fitId`s já existentes (não deletados) nesta CONTA, dentre os informados — insumo do
 * dedup (ver service.ts `previewImport`/`commitImport`). Cartão nunca usa `fitId`. */
async function findExistingFitIds(
  userId: string,
  target: ImportTarget,
  fitIds: string[],
  db: Db = prisma,
): Promise<Set<string>> {
  if (fitIds.length === 0 || target.kind === "card") return new Set();

  const rows = await db.transaction.findMany({
    where: { userId, accountId: target.accountId, deletedAt: null, fitId: { in: fitIds } },
    select: { fitId: true },
  });

  return new Set(rows.flatMap((row) => (row.fitId ? [row.fitId] : [])));
}

/**
 * Transactions SEM `fitId` deste target — insumo do dedup de fallback. Pra conta é o raro
 * caso de `<STMTTRN>` sem `<FITID>`; pra cartão é o caso NORMAL (fatura em PDF nunca tem
 * `fitId`, sempre cai no fallback `(data,valor)` — ver service.ts `buildFallbackKey`).
 */
async function findFallbackRows(userId: string, target: ImportTarget, db: Db = prisma): Promise<FallbackRow[]> {
  const where =
    target.kind === "account"
      ? { userId, accountId: target.accountId, deletedAt: null, fitId: null }
      : { userId, cardId: target.cardId, deletedAt: null, fitId: null };

  const rows = await db.transaction.findMany({
    where,
    select: { date: true, amount: true, description: true },
  });

  // `toFixed(2)` — mesmo racional do arquivo original (formato precisa bater com o lado
  // parseado, `Decimal.toFixed(2)` em todo `parsers/*.ts`).
  return rows.map((row) => ({ date: row.date, amount: row.amount.toFixed(2), description: row.description }));
}

/**
 * Insere as N Transactions já filtradas (sem duplicatas). `isPaid` sempre `true`
 * (docs/20-TRANSACTIONS.md). Cartão: `cardId` set, `accountId` null. Conta: o inverso —
 * mesmo par de campos, nunca os dois setados (schema.prisma, `Transaction.accountId`/`cardId`
 * ambos opcionais, mutuamente exclusivos por convenção do domínio, não por constraint de
 * banco).
 *
 * `skipDuplicates`: rede de segurança contra commit concorrente SÓ funciona pra CONTA
 * (índice único parcial `Transaction_accountId_fitId_key`, `fitId` não-null) — cartão nunca
 * tem `fitId`, então esse índice não protege fatura; o dedup de fatura é só em-app (mesmo
 * nível de proteção que o fallback-sem-fitId de conta já tinha, ver comentário em
 * `service.ts` `buildFallbackKeyCounts` — decisão consciente, não lacuna nova).
 */
async function insertMany(userId: string, target: ImportTarget, items: CommitItem[], db: Db = prisma): Promise<number> {
  if (items.length === 0) return 0;

  const result = await db.transaction.createMany({
    skipDuplicates: true,
    data: items.map((item) => ({
      userId,
      accountId: target.kind === "account" ? target.accountId : null,
      cardId: target.kind === "card" ? target.cardId : null,
      description: item.description,
      type: item.type,
      amount: item.amount,
      categoryId: item.categoryId,
      date: item.date,
      isPaid: true,
      fitId: item.fitId,
    })),
  });

  return result.count;
}

export const importRepository = {
  findExistingFitIds,
  findFallbackRows,
  insertMany,
};
