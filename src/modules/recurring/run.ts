import type { RecurringTransaction } from "@/generated/prisma/client";
import { recurringRepository } from "./repository";
import { computeNextRun } from "./next-run";
import type { GeneratedRun } from "./types";

/**
 * Gera TODAS as Transactions em atraso de UM template — não só a próxima
 * vencida (docs backlog L6): repete o disparo, avançando `nextRun` a cada
 * volta (`advanceAndCreateTransaction`, atômico e idempotente via lock
 * otimista — ver JSDoc lá, PRESERVADO sem mudança), até `nextRun` passar de
 * `now`. Sem o loop aqui, um cron parado 3 meses (MONTHLY) precisaria de 3
 * execuções do cron pra repor as 3 Transactions perdidas — cada chamada só
 * avançava 1 período. `computeNextRun` sempre retorna estritamente DEPOIS do
 * `from` recebido (ver next-run.ts), então o loop termina garantidamente.
 *
 * `result === null` (lock perdido — outra execução concorrente já processou
 * esta rodada do template) interrompe o catch-up aqui: qualquer progresso já
 * feito por essa outra execução continua íntegro, sem essa chamada tentar
 * reprocessar em cima dele.
 *
 * `isPaid = true` sempre — toda Transaction nasce paga por padrão
 * (docs/20-TRANSACTIONS.md, "Status de Pagamento") e o template não tem
 * campo próprio pra sinalizar diferente. Se o produto precisar de
 * recorrências que nascem pendentes (ex.: boleto agendado), isso é um novo
 * campo no schema — fora do escopo desta task.
 */
async function fireOnce(template: RecurringTransaction, now: Date): Promise<GeneratedRun[]> {
  const schedule = { frequency: template.frequency, dayOfMonth: template.dayOfMonth, dayOfWeek: template.dayOfWeek };
  const generated: GeneratedRun[] = [];
  let expectedNextRun = template.nextRun;

  while (expectedNextRun.getTime() <= now.getTime()) {
    const newNextRun = computeNextRun(schedule, expectedNextRun);

    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, catch-up do MESMO template (idempotente via lock otimista)
    const result = await recurringRepository.advanceAndCreateTransaction({
      templateId: template.id,
      expectedNextRun,
      newNextRun,
      transactionData: {
        userId: template.userId,
        description: template.description,
        amount: template.amount.toString(),
        type: template.type,
        categoryId: template.categoryId,
        accountId: template.accountId,
        date: expectedNextRun,
        isPaid: true,
      },
    });

    if (!result) break;

    generated.push({
      recurringTransactionId: template.id,
      transactionId: result.transactionId,
      userId: template.userId,
      date: expectedNextRun,
    });

    expectedNextRun = newNextRun;
  }

  return generated;
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
    const results = await fireOnce(template, now);
    generated.push(...results);
  }

  return generated;
}
