import { Prisma, type Alert } from "@/generated/prisma/client";
import { AlertType, AlertSeverity } from "@/generated/prisma/enums";
import type { RecurringTransaction } from "@/generated/prisma/client";
import { recurringRepository } from "@/modules/recurring/repository";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { formatBRL } from "@/lib/money/format";
import { alertRepository, type ExpenseSignatureRow } from "./repository";

/** Janela de leitura: últimos 6 meses de despesas (docs/29-ALERTS.md não cobre este detector ainda — heurística nova, sem tabela própria). */
const LOOKBACK_MONTHS = 6;

/** Mínimo de meses distintos em que a mesma (descrição, valor) precisa aparecer pra virar candidata — aproxima cadência mensal sem exigir dia fixo. */
const MIN_MONTHS_FOR_SUGGESTION = 3;

/** Um candidato a recorrência ainda não automatizada, já agrupado por assinatura. */
type RecurringCandidate = {
  /** Chave estável `descrição-normalizada::valor` — usada tanto pra dedup de Alert quanto pra suprimir recorrências já automatizadas. */
  signature: string;
  /** Descrição original mais recente do grupo (não a normalizada) — pro título/mensagem do Alert. */
  description: string;
  amount: Prisma.Decimal;
  /** Número de meses distintos (America/Sao_Paulo) em que o grupo apareceu. */
  occurrences: number;
  categoryId: string | null;
};

/** Trim + lowercase + colapso de espaços — normalização de descrição pra agrupar variações triviais ("Netflix ", "netflix") como o mesmo gasto. */
function normalizeDescription(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, " ");
}

function signatureFor(normalizedDescription: string, amount: Prisma.Decimal): string {
  return `${normalizedDescription}::${amount.toFixed(2)}`;
}

/** Início (00:00 SP) do mês `months` atrás do mês-calendário de `refDate` — janela de leitura do detector, não usa aritmética em ms (mesmo racional de `modules/recurring/next-run.ts`). */
function monthsAgoStartSP(refDate: Date, months: number): Date {
  const { year, month } = calendarPartsSP(refDate);

  let targetMonth = month - months;
  let targetYear = year;
  while (targetMonth <= 0) {
    targetMonth += 12;
    targetYear -= 1;
  }

  return startOfDaySP(targetYear, targetMonth, 1);
}

/**
 * Agrupa despesas por `(descrição normalizada, valor)` e mantém só os grupos
 * que aparecem em `MIN_MONTHS_FOR_SUGGESTION` meses distintos ou mais
 * (cadência ~mensal) — heurística pura, sem I/O, testável isoladamente.
 */
export function groupRecurringCandidates(rows: ExpenseSignatureRow[]): RecurringCandidate[] {
  type Group = {
    amount: Prisma.Decimal;
    months: Set<string>;
    latestDescription: string;
    latestDate: Date;
    latestCategoryId: string | null;
  };

  const groups = new Map<string, Group>();

  for (const row of rows) {
    const normalizedDescription = normalizeDescription(row.description);
    const key = signatureFor(normalizedDescription, row.amount);
    const { year, month } = calendarPartsSP(row.date);
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        amount: row.amount,
        months: new Set([monthKey]),
        latestDescription: row.description,
        latestDate: row.date,
        latestCategoryId: row.categoryId,
      });
      continue;
    }

    existing.months.add(monthKey);
    if (row.date >= existing.latestDate) {
      existing.latestDescription = row.description;
      existing.latestDate = row.date;
      existing.latestCategoryId = row.categoryId;
    }
  }

  const candidates: RecurringCandidate[] = [];
  for (const [signature, group] of groups) {
    if (group.months.size < MIN_MONTHS_FOR_SUGGESTION) continue;

    candidates.push({
      signature,
      description: group.latestDescription,
      amount: group.amount,
      occurrences: group.months.size,
      categoryId: group.latestCategoryId,
    });
  }

  return candidates;
}

/** Assinaturas `(descrição normalizada, valor)` de `RecurringTransaction` ATIVAS — candidatos que batem aqui já são automatizados, não precisam de sugestão. */
function activeRecurringSignatures(recurrings: RecurringTransaction[]): Set<string> {
  const signatures = new Set<string>();

  for (const recurring of recurrings) {
    if (!recurring.active) continue;
    signatures.add(signatureFor(normalizeDescription(recurring.description), recurring.amount));
  }

  return signatures;
}

/**
 * Detecta e persiste alertas RECURRING_SUGGESTION: despesas que se repetem
 * (mesma descrição normalizada + valor) em `MIN_MONTHS_FOR_SUGGESTION`+ meses
 * distintos dos últimos `LOOKBACK_MONTHS` meses, e que AINDA NÃO têm uma
 * `RecurringTransaction` ativa equivalente (sem FK `recurringTransactionId`
 * em `Transaction` — match por campos de negócio, não por id).
 *
 * Idempotente por `signature` — dedup via `alertRepository.findByDedupKey`,
 * então rodar o cron semanal repetidas vezes não spamma a mesma sugestão.
 */
export async function detectRecurringSuggestions(userId: string, refDate: Date): Promise<Alert[]> {
  const since = monthsAgoStartSP(refDate, LOOKBACK_MONTHS);

  const [expenses, recurrings] = await Promise.all([
    alertRepository.findExpensesSince(userId, since),
    recurringRepository.list(userId),
  ]);

  const candidates = groupRecurringCandidates(expenses);
  const automated = activeRecurringSignatures(recurrings);

  const created: Alert[] = [];

  for (const candidate of candidates) {
    if (automated.has(candidate.signature)) continue;

    // eslint-disable-next-line no-await-in-loop -- sequencial de propósito, mesmo padrão de anomaly.ts/green.ts (volume trivial: poucos candidatos, 2 usuários)
    const existing = await alertRepository.findByDedupKey(userId, AlertType.RECURRING_SUGGESTION, [
      { path: ["signature"], value: candidate.signature },
    ]);
    if (existing) continue;

    const amount = candidate.amount.toFixed(2);
    const payload = {
      signature: candidate.signature,
      description: candidate.description,
      amount,
      occurrences: candidate.occurrences,
      categoryId: candidate.categoryId,
    };

    // eslint-disable-next-line no-await-in-loop -- ver comentário acima
    const alert = await alertRepository.create(userId, {
      type: AlertType.RECURRING_SUGGESTION,
      severity: AlertSeverity.INFO,
      title: "Possível gasto recorrente",
      message: `"${candidate.description}" aparece há ${candidate.occurrences} meses (${formatBRL(amount)}). Quer cadastrar como recorrente?`,
      payload: payload as unknown as Prisma.InputJsonValue,
    });

    created.push(alert);
  }

  return created;
}
