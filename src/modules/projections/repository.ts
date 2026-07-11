import { prisma } from "@/lib/db/client";
import type { Prisma, RecurringTransaction } from "@/generated/prisma/client";

export type DateRange = { gte: Date; lte: Date };

/** Só os campos usados pra somar o impacto de UMA parcela de empréstimo no saldo (ver service.ts). */
export type LoanInstallmentRow = { date: Date; amount: Prisma.Decimal };

/**
 * Acesso a dados do módulo projections. SEMPRE escopado por `userId`
 * (docs/03-DATABASE.md, "Princípio Principal"). Só leitura — a projeção é
 * pure-compute e não persiste nada.
 */

/**
 * Parcelas de EMPRÉSTIMO ainda não pagas com vencimento até o fim da janela
 * (`range.lte`) — debitam a conta diretamente na data quando pagas
 * (docs/03-DATABASE.md, campo `loanId` do Transaction: "análogo a
 * installmentPurchaseId, mas na CONTA"). SEM limite inferior de data
 * de propósito: inclui parcelas ATRASADAS (vencidas antes de hoje, ainda
 * `isPaid:false`) — são dívida real que já deveria ter saído da conta e não
 * pode sumir da projeção só porque o cron de vencimento ainda não rodou
 * (`service.ts` aplica essas no dia 0 da janela, clamp pra `startDay`). Exclui
 * soft-deletadas e pernas de transferência (mesmos filtros de
 * `reportRepository.buildCashflowConditions`, base "conta-only").
 */
async function listUnpaidLoanInstallments(userId: string, range: DateRange): Promise<LoanInstallmentRow[]> {
  return prisma.transaction.findMany({
    where: {
      userId,
      loanId: { not: null },
      isPaid: false,
      deletedAt: null,
      transferId: null,
      date: { lte: range.lte },
    },
    select: { date: true, amount: true },
  });
}

/**
 * Templates de recorrência ATIVOS do usuário — insumo pra projetar
 * ocorrências futuras dia a dia (ver `recurrence-projection.ts`). Sem janela
 * de data aqui: o corte pela janela de projeção acontece depois de calcular
 * as ocorrências (a periodicidade de cada template só é conhecida avançando
 * `nextRun` via `computeNextRun`).
 */
async function listActiveRecurringTransactions(userId: string): Promise<RecurringTransaction[]> {
  return prisma.recurringTransaction.findMany({ where: { userId, active: true } });
}

export const projectionRepository = {
  listUnpaidLoanInstallments,
  listActiveRecurringTransactions,
};
