import type { RecurringTransaction } from "@/generated/prisma/client";
import { recurringRepository } from "./repository";
import { computeNextRun } from "./next-run";
import type { GeneratedRun } from "./types";

/**
 * Gera a Transaction correspondente a UM template vencido e avança seu
 * `nextRun`, atomicamente (ver repository.ts `advanceAndCreateTransaction`
 * pro detalhe de idempotência via lock otimista).
 *
 * `isPaid = true` sempre — toda Transaction nasce paga por padrão
 * (docs/20-TRANSACTIONS.md, "Status de Pagamento") e o template não tem
 * campo próprio pra sinalizar diferente. Se o produto precisar de
 * recorrências que nascem pendentes (ex.: boleto agendado), isso é um novo
 * campo no schema — fora do escopo desta task.
 */
async function fireOnce(template: RecurringTransaction): Promise<GeneratedRun | null> {
  const newNextRun = computeNextRun(
    { frequency: template.frequency, dayOfMonth: template.dayOfMonth, dayOfWeek: template.dayOfWeek },
    template.nextRun,
  );

  const result = await recurringRepository.advanceAndCreateTransaction({
    templateId: template.id,
    expectedNextRun: template.nextRun,
    newNextRun,
    transactionData: {
      userId: template.userId,
      description: template.description,
      amount: template.amount.toString(),
      type: template.type,
      categoryId: template.categoryId,
      accountId: template.accountId,
      date: template.nextRun,
      isPaid: true,
    },
  });

  if (!result) return null;

  return {
    recurringTransactionId: template.id,
    transactionId: result.transactionId,
    userId: template.userId,
    date: template.nextRun,
  };
}

/**
 * Processa todos os templates ativos vencidos (`nextRun <= now`) — de UM
 * usuário (`userId` informado) ou de TODOS (cron global, `userId`
 * omitido, ver docs/29-ALERTS.md pro precedente de cron protegido).
 *
 * Sequencial por template (não `Promise.all`) — cada `fireOnce` já é
 * atômico isoladamente; processar em paralelo não traria ganho real pro
 * volume de 2 usuários e evitaria qualquer contenção de conexão do pool
 * (mesmo raciocínio de `modules/transactions/installments.ts`).
 */
export async function runDue(userId?: string, now: Date = new Date()): Promise<GeneratedRun[]> {
  const dueTemplates = userId
    ? await recurringRepository.findDueForUser(userId, now)
    : await recurringRepository.findAllDue(now);

  const generated: GeneratedRun[] = [];

  for (const template of dueTemplates) {
    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, ver JSDoc acima
    const result = await fireOnce(template);
    if (result) generated.push(result);
  }

  return generated;
}
