import { prisma } from "@/lib/db/client";
import { Prisma, type Alert } from "@/generated/prisma/client";
import { TransactionType, type AlertType, type AlertSeverity } from "@/generated/prisma/enums";

export type CreateAlertData = {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  payload: Prisma.InputJsonValue;
};

export type AlertListFilter = {
  type?: AlertType;
  unreadOnly?: boolean;
};

/** Um segmento da chave de dedup: valor esperado num caminho do JSON `payload`. */
export type DedupKeyPart = { path: string[]; value: string };

/**
 * Acesso a dados do módulo alerts. SEMPRE escopado por `userId`
 * (docs/03-DATABASE.md, "Princípio Principal"). `Alert` não tem soft delete —
 * "excluir" não existe no domínio, só `markRead` (docs/29-ALERTS.md,
 * "Persistência e Leitura": alerta nunca é apagado, só marcado como lido).
 */

async function create(userId: string, data: CreateAlertData): Promise<Alert> {
  return prisma.alert.create({
    data: {
      userId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      message: data.message,
      payload: data.payload,
    },
  });
}

function buildWhere(userId: string, filters: AlertListFilter): Prisma.AlertWhereInput {
  return {
    userId,
    ...(filters.type && { type: filters.type }),
    ...(filters.unreadOnly && { readAt: null }),
  };
}

async function list(userId: string, filters: AlertListFilter = {}): Promise<Alert[]> {
  return prisma.alert.findMany({
    where: buildWhere(userId, filters),
    orderBy: { createdAt: "desc" },
  });
}

async function findById(userId: string, id: string): Promise<Alert | null> {
  return prisma.alert.findFirst({ where: { id, userId } });
}

/**
 * Marca como lido — idempotente: se já está lido, retorna o registro sem
 * sobrescrever `readAt` (repetir a leitura não é erro, docs/29-ALERTS.md
 * "Regra 3": marcar como lido não apaga, só remove do destaque).
 */
async function markRead(userId: string, id: string): Promise<Alert | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;
  if (existing.readAt) return existing;

  return prisma.alert.update({ where: { id }, data: { readAt: new Date() } });
}

/** Alertas ativos do Dashboard (`readAt = null`), mais recentes primeiro (docs/11-DASHBOARD.md, "Lista de Alertas Ativos"). */
async function listActiveForDashboard(userId: string): Promise<Alert[]> {
  return prisma.alert.findMany({
    where: { userId, readAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Verifica se já existe um alerta para a MESMA chave de dedup — usado pra
 * idempotência da geração (`Alert` não tem `@@unique` dedicada; "rodar o cron
 * 2x" precisa checar existência antes de criar, não upsert). Cada parte da
 * chave vira um filtro JSON path (`payload.path` do Postgres via Prisma
 * `JsonFilter`); múltiplas partes combinam em AND (ex.: `weekKey` +
 * `categoryId` para ANOMALY/GREEN por categoria).
 */
async function findByDedupKey(userId: string, type: AlertType, parts: DedupKeyPart[]): Promise<Alert | null> {
  return prisma.alert.findFirst({
    where: {
      userId,
      type,
      AND: parts.map((part) => ({ payload: { path: part.path, equals: part.value } })),
    },
  });
}

/** Ids de TODOS os usuários — usado pelo cron global (`/api/cron/weekly-summary`, mesmo precedente de `modules/recurring/repository.ts` `findAllDue`). */
async function listAllUserIds(): Promise<string[]> {
  const users = await prisma.user.findMany({ select: { id: true } });
  return users.map((user) => user.id);
}

export type ExpenseSignatureRow = {
  description: string;
  amount: Prisma.Decimal;
  date: Date;
  categoryId: string | null;
};

/**
 * Despesas EXPENSE não-transferência desde `since` — insumo bruto do detector
 * de sugestão de recorrência (`recurring-suggestion.ts`). Sem agregação
 * aqui: o agrupamento por (descrição normalizada, valor, mês) é lógica de
 * domínio do detector, não do acesso a dados (mesmo racional de
 * `groupExpensesByCategoryInRange` em `modules/transactions/repository.ts`,
 * que também deixa a agregação de negócio pro caller).
 */
async function findExpensesSince(userId: string, since: Date): Promise<ExpenseSignatureRow[]> {
  return prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
      type: TransactionType.EXPENSE,
      transferId: null,
      date: { gte: since },
    },
    select: { description: true, amount: true, date: true, categoryId: true },
    orderBy: { date: "asc" },
  });
}

export const alertRepository = {
  create,
  list,
  findById,
  markRead,
  listActiveForDashboard,
  findByDedupKey,
  listAllUserIds,
  findExpensesSince,
};
