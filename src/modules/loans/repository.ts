import { prisma } from "@/lib/db/client";
import type { Loan, Prisma } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { LoanInstallmentAlreadyPaidError } from "./errors";
import type { LoanWithTransactions, LoanInstallmentRow } from "./types";

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

/**
 * `db` opcional (default `prisma`) — diferente das outras leituras deste
 * repository, PRECISA aceitar o client de uma `$transaction` interativa
 * quando chamada DEPOIS de escrever nessa mesma transação (ver `update.ts`
 * `updateLoan`): ler pelo `prisma` global nesse caso enxergaria o estado
 * ANTES do commit (conexão separada), não as escritas pendentes.
 */
async function findByIdWithTransactions(userId: string, id: string, db: Db = prisma): Promise<LoanWithTransactions | null> {
  return db.loan.findFirst({
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
 * Update genérico do Loan (edição de contrato — `update.ts` `updateLoan`).
 * Reconfirma ownership via `findById` antes de escrever (mesmo padrão de
 * `softDelete`) — nunca um `update` direto por `id` sem revalidar
 * `userId`/`deletedAt` primeiro.
 */
async function update(userId: string, id: string, data: Prisma.LoanUncheckedUpdateInput, db: Db = prisma): Promise<Loan | null> {
  const existing = await findById(userId, id, db);
  if (!existing) return null;

  return db.loan.update({ where: { id }, data });
}

/**
 * Uma parcela (`Transaction` `type=EXPENSE`) específica de um empréstimo,
 * escopada por `userId` E `loanId` — insumo de `suggestEarlyPayment` e da
 * quitação (`settleLoan`). Filtra `type=EXPENSE` pra nunca confundir com o
 * desembolso (`type=INCOME`) linkado ao mesmo `loanId` (ver service.ts
 * `findDisbursement`).
 */
async function findInstallment(
  userId: string,
  loanId: string,
  installmentId: string,
  db: Db = prisma,
): Promise<LoanInstallmentRow | null> {
  return db.transaction.findFirst({
    where: { id: installmentId, userId, loanId, type: TransactionType.EXPENSE, deletedAt: null },
    select: { id: true, amount: true, date: true, isPaid: true },
  });
}

/**
 * Marca UMA parcela como paga com o valor CONFIRMADO (cheio ou com desconto
 * de antecipação editado pelo usuário) — usado só por `settleLoan`
 * (quitação em lote, escrita direta porque precisa rodar N vezes dentro da
 * MESMA `$transaction` atômica). Marcar uma parcela avulsa fora da quitação
 * já é coberto por `updateTransactionAction` (ver service.ts, JSDoc de
 * `settleLoan` — decisão de não duplicar essa função pro caso avulso).
 *
 * `updateMany` com `isPaid: false` no `WHERE` (em vez de `update` por `id`
 * cru) recheca a condição no MESMO instante da escrita, dentro da
 * `$transaction` — fecha o TOCTOU entre a leitura de "parcelas não pagas"
 * no início de `settleLoan` e esta escrita (a parcela pode ter sido marcada
 * paga individualmente nesse meio-tempo). `count === 0` ⇒ perdeu a corrida:
 * lança em vez de sobrescrever o `amount` real já pago com o valor rateado
 * (docs backlog L4).
 */
async function markInstallmentPaid(installmentId: string, amount: Prisma.Decimal, paidAt: Date, db: Db = prisma): Promise<void> {
  const result = await db.transaction.updateMany({
    where: { id: installmentId, isPaid: false },
    data: { amount, isPaid: true, paidAt },
  });
  if (result.count === 0) throw new LoanInstallmentAlreadyPaidError(installmentId);
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
  update,
  findInstallment,
  markInstallmentPaid,
};
