import { prisma } from "@/lib/db/client";
import type { Loan, Prisma } from "@/generated/prisma/client";
import type { LoanWithTransactions } from "./types";

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (ver `installments.ts`, `service.ts` `deleteLoan`). */
type Db = Prisma.TransactionClient;

/**
 * Traz TODAS as transações linkadas por `loanId` — parcelas (`type=EXPENSE`)
 * E o desembolso (`type=INCOME`), sem filtrar por tipo aqui: a separação é
 * regra de negócio (`service.ts` `deriveLoanProgress`/`findDisbursement`),
 * não de acesso a dados. `select.type` existe só pra viabilizar essa
 * separação no service.
 */
const TRANSACTIONS_INCLUDE = {
  transactions: {
    where: { deletedAt: null },
    select: { id: true, amount: true, date: true, isPaid: true, type: true },
    orderBy: { date: "asc" },
  },
} as const;

/**
 * Acesso a dados do módulo loans. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string, db: Db = prisma): Promise<Loan | null> {
  return db.loan.findFirst({ where: { id, userId, deletedAt: null } });
}

async function findByIdWithTransactions(userId: string, id: string): Promise<LoanWithTransactions | null> {
  return prisma.loan.findFirst({
    where: { id, userId, deletedAt: null },
    include: TRANSACTIONS_INCLUDE,
  });
}

/**
 * Empréstimos ativos (não soft-deletados) do usuário + parcelas não deletadas
 * — insumo do progresso derivado (ver service.ts `deriveLoanProgress`). Sem
 * agregação aqui: a derivação (pago/restante/próxima parcela) é regra de
 * negócio, não de acesso a dados (mesmo padrão de
 * `transactionRepository.listInstallmentPurchasesWithTransactions`).
 */
async function list(userId: string): Promise<LoanWithTransactions[]> {
  return prisma.loan.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: TRANSACTIONS_INCLUDE,
  });
}

/** Soft delete — nunca remove fisicamente (mesmo padrão de transactions/accounts/cards). */
async function softDelete(userId: string, id: string, db: Db = prisma): Promise<Loan | null> {
  const existing = await findById(userId, id, db);
  if (!existing) return null;

  return db.loan.update({ where: { id }, data: { deletedAt: new Date() } });
}

/**
 * Soft-delete das parcelas FUTURAS ainda não pagas (`isPaid=false`) de um
 * empréstimo — parcelas já pagas mantêm o histórico intacto (decisão de
 * `deleteLoan`, ver service.ts). Escopado por `userId` além de `loanId` —
 * defesa em profundidade, mesmo o `loanId` já vindo de um Loan validado pelo
 * chamador.
 */
async function softDeleteUnpaidInstallments(userId: string, loanId: string, db: Db = prisma): Promise<void> {
  await db.transaction.updateMany({
    where: { userId, loanId, isPaid: false, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export const loanRepository = {
  findById,
  findByIdWithTransactions,
  list,
  softDelete,
  softDeleteUnpaidInstallments,
};
