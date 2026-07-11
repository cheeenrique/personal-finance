import type { Prisma, RecurringTransaction } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import { computeNextRun } from "@/modules/recurring/next-run";

/** Uma ocorrência projetada de um template — data + valor JÁ com sinal aplicado (pronto pra somar no saldo). */
export type ProjectedMovement = { date: Date; signedAmount: Prisma.Decimal };

/** Sinal do valor no saldo da conta — INCOME soma, EXPENSE subtrai (mesma convenção de `accountService.signedAmount`). */
function signedRecurringAmount(type: TransactionType, amount: Prisma.Decimal): Prisma.Decimal {
  return type === TransactionType.INCOME ? amount : amount.negated();
}

/**
 * Projeta as ocorrências futuras de UM template de recorrência dentro de
 * `[start, end]` (ambos inclusive), avançando com `computeNextRun`
 * (`modules/recurring/next-run.ts`) — mesmo motor de agendamento do cron de
 * recorrências, nunca reescrito aqui. `template.nextRun` é o próximo disparo
 * conhecido; o loop avança estritamente pra frente (garantia de
 * `computeNextRun`, ver seu JSDoc) até ultrapassar `end`, incluindo só as
 * ocorrências que caem dentro da janela.
 *
 * Se `nextRun` já estiver ANTES de `start` (template atrasado — cron não
 * rodou ainda), essa PRIMEIRA ocorrência não é descartada: ela representa uma
 * obrigação que já deveria ter disparado e ainda não foi convertida em
 * Transaction, então entra na projeção com sua data original (`service.ts`
 * aplica o clamp pra `startDay` ao bucketizar, mesmo tratamento das parcelas
 * de empréstimo atrasadas). Só a PRIMEIRA ocorrência recebe esse tratamento —
 * as ocorrências seguintes (já dentro da janela, avançadas por
 * `computeNextRun`) continuam filtradas normalmente por `>= start`.
 */
export function projectRecurringOccurrences(
  template: RecurringTransaction,
  start: Date,
  end: Date,
): ProjectedMovement[] {
  const schedule = { frequency: template.frequency, dayOfMonth: template.dayOfMonth, dayOfWeek: template.dayOfWeek };
  const signedAmount = signedRecurringAmount(template.type, template.amount);
  const occurrences: ProjectedMovement[] = [];

  let occurrence = template.nextRun;
  let isFirstOccurrence = true;
  while (occurrence.getTime() <= end.getTime()) {
    if (isFirstOccurrence || occurrence.getTime() >= start.getTime()) {
      occurrences.push({ date: occurrence, signedAmount });
    }
    isFirstOccurrence = false;
    occurrence = computeNextRun(schedule, occurrence);
  }

  return occurrences;
}
