import { prisma } from "@/lib/db/client";
import { Prisma, type Category } from "@/generated/prisma/client";
import { TransactionType } from "@/generated/prisma/enums";
import type {
  TransactionWithTags,
  TransactionSort,
  Transaction,
  RecentTransactionRow,
  InstallmentPurchaseRow,
} from "./types";

export type CreateTransactionData = {
  description: string;
  type: TransactionType;
  amount: string;
  categoryId: string | null;
  accountId: string | null;
  cardId: string | null;
  date: Date;
  notes: string | null;
  isPaid: boolean;
  tagIds: string[];
  /** Aporte de investimento (docs/28-INVESTMENTS.md) — opcional. */
  assetId?: string | null;
  /** Override do % do CDI neste aporte; null = default do Asset. */
  yieldPercentOfBenchmark?: string | null;
};

export type UpdateTransactionData = Partial<Omit<CreateTransactionData, "tagIds">> & {
  tagIds?: string[];
  /** Derivado da transição de `isPaid` — sempre resolvido pelo service (`resolvePaidAtOnUpdate`), nunca repassado cru do caller. */
  paidAt?: Date | null;
};

export type TransactionListFilter = {
  search?: string;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  cardId?: string;
  tagId?: string;
  isPaid?: boolean;
  /**
   * `type=TRANSFER` nunca é persistido (docs/20-TRANSACTIONS.md,
   * "Transferência") — as 2 pernas nascem EXPENSE/INCOME com `transferId`
   * preenchido. Filtro "Transferência" na UI usa este campo em vez de `type`.
   */
  isTransfer?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  amountMin?: string;
  amountMax?: string;
};

export type TransactionListPage = {
  page: number;
  pageSize: number;
  sort: TransactionSort;
};

export type ExpenseCategoryGroup = { categoryId: string | null; sum: Prisma.Decimal };

/**
 * Include padrão de leitura/escrita de `Transaction` — tags + `loan.kind`
 * (só o `kind`, sem o resto do `Loan`) pro front distinguir badge
 * "Empréstimo" (LOAN) de "Financiamento" (FINANCING) sem 2ª query por linha
 * (join único, sem N+1 mesmo em `list`).
 */
const TAG_INCLUDE = { transactionTags: true, loan: { select: { kind: true } } } as const;

/** Client Prisma padrão ou escopado a uma `$transaction` interativa (mesmo padrão de `modules/loans/repository.ts`). */
type Db = Prisma.TransactionClient;

/**
 * Acesso a dados do módulo transactions. SEMPRE escopado por `userId` +
 * `deletedAt: null` — nunca query sem essas duas condições (ver
 * docs/03-DATABASE.md, "Princípio Principal": isolamento total por usuário).
 */

async function findById(userId: string, id: string): Promise<TransactionWithTags | null> {
  return prisma.transaction.findFirst({
    where: { id, userId, deletedAt: null },
    include: TAG_INCLUDE,
  });
}

/** Só para o fluxo de undo — busca uma transação JÁ soft-deletada (ver `restore`). */
async function findDeletedById(userId: string, id: string): Promise<TransactionWithTags | null> {
  return prisma.transaction.findFirst({
    where: { id, userId, NOT: { deletedAt: null } },
    include: TAG_INCLUDE,
  });
}

async function create(userId: string, data: CreateTransactionData): Promise<TransactionWithTags> {
  return prisma.transaction.create({
    data: {
      userId,
      description: data.description,
      type: data.type,
      amount: data.amount,
      categoryId: data.categoryId,
      accountId: data.accountId,
      cardId: data.cardId,
      date: data.date,
      notes: data.notes,
      isPaid: data.isPaid,
      ...(data.assetId !== undefined && { assetId: data.assetId }),
      ...(data.yieldPercentOfBenchmark !== undefined && {
        yieldPercentOfBenchmark: data.yieldPercentOfBenchmark,
      }),
      transactionTags:
        data.tagIds.length > 0 ? { create: data.tagIds.map((tagId) => ({ tagId })) } : undefined,
    },
    include: TAG_INCLUDE,
  });
}

/**
 * Verifica ownership (findById escopado) antes de atualizar — evita editar
 * transação de outro usuário mesmo sabendo o `id` (docs/10-AUTH.md, "Regra
 * Principal de Segurança"). Quando `tagIds` é enviado, substitui o conjunto
 * inteiro (deleteMany + create) — não faz merge incremental.
 */
async function update(
  userId: string,
  id: string,
  data: UpdateTransactionData,
): Promise<TransactionWithTags | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: {
      ...(data.description !== undefined && { description: data.description }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.amount !== undefined && { amount: data.amount }),
      ...(data.categoryId !== undefined && { categoryId: data.categoryId }),
      ...(data.accountId !== undefined && { accountId: data.accountId }),
      ...(data.cardId !== undefined && { cardId: data.cardId }),
      ...(data.date !== undefined && { date: data.date }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isPaid !== undefined && { isPaid: data.isPaid }),
      ...(data.paidAt !== undefined && { paidAt: data.paidAt }),
      ...(data.tagIds !== undefined && {
        transactionTags: { deleteMany: {}, create: data.tagIds.map((tagId) => ({ tagId })) },
      }),
    },
    include: TAG_INCLUDE,
  });
}

/** Soft delete — nunca remove fisicamente (docs/20-TRANSACTIONS.md, "Soft Delete"). */
async function softDelete(userId: string, id: string): Promise<TransactionWithTags | null> {
  const existing = await findById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: { deletedAt: new Date() },
    include: TAG_INCLUDE,
  });
}

/**
 * Soft-delete das DUAS pernas de uma transferência de uma vez (docs/
 * 20-TRANSACTIONS.md, "Transferência": excluir uma perna propaga pra outra —
 * as 2 formam uma unidade lógica). Um único `updateMany` = um único UPDATE no
 * Postgres, atômico por construção: nunca existe janela com só uma perna
 * deletada (que desbalancearia o saldo das 2 contas). Idempotente — pernas já
 * deletadas ficam fora do `where` (`deletedAt: null`) e não são re-carimbadas.
 * Escopado por `userId` (docs/10-AUTH.md) — as 2 pernas nascem do MESMO
 * usuário (`accounts/transfer.ts` `createTransfer`), então o escopo cobre
 * ambas.
 */
async function softDeleteByTransferId(userId: string, transferId: string): Promise<number> {
  const result = await prisma.transaction.updateMany({
    where: { userId, transferId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count;
}

/** Undo do soft delete — limpa `deletedAt` (docs/20-TRANSACTIONS.md, "permitir undo"). */
async function restore(userId: string, id: string): Promise<TransactionWithTags | null> {
  const existing = await findDeletedById(userId, id);
  if (!existing) return null;

  return prisma.transaction.update({
    where: { id },
    data: { deletedAt: null },
    include: TAG_INCLUDE,
  });
}

/**
 * Espelho de `softDeleteByTransferId` pro undo — restaura as DUAS pernas
 * soft-deletadas da transferência num único UPDATE (mesma garantia de
 * atomicidade/idempotência; pernas já vivas ficam fora do `where`).
 */
async function restoreByTransferId(userId: string, transferId: string): Promise<number> {
  const result = await prisma.transaction.updateMany({
    where: { userId, transferId, NOT: { deletedAt: null } },
    data: { deletedAt: null },
  });
  return result.count;
}

/**
 * Condições WHERE da listagem paginada, em SQL cru (`Prisma.Sql[]`, mesmo
 * padrão de `reports/repository.ts` `buildCashflowConditions`) — única fonte
 * de verdade reaproveitada tanto pelo COUNT quanto pela query de ids
 * ordenados (`list` abaixo). Existe em SQL cru (não `Prisma.TransactionWhereInput`
 * como o resto do módulo) porque o filtro de período passou a usar a DATA
 * EFETIVA (`COALESCE("paidAt", "date")` — docs/20-TRANSACTIONS.md, "Data
 * Efetiva"): paga é filtrada pela data em que o dinheiro saiu (`paidAt`),
 * pendente pelo vencimento (`date`), mesma regra do fluxo de caixa
 * (`sumAmountByTypeInRange` abaixo). Manter os dois filtros (WHERE do count e
 * WHERE da ordenação) como Prisma-objects diferentes arriscaria os dois
 * divergirem com o tempo — um único builder elimina esse risco. `dateTo` é
 * `lte` cru (sem extensão de fim de dia) de propósito: mesma semântica que o
 * filtro anterior por `date` já tinha (o caller já resolve o range antes de
 * chamar `list`, ver `components/transactions/period-presets.ts`) — não é
 * escopo desta mudança alterar esse contrato.
 */
function buildListConditions(userId: string, filters: TransactionListFilter): Prisma.Sql[] {
  const conditions: Prisma.Sql[] = [Prisma.sql`"userId" = ${userId}`, Prisma.sql`"deletedAt" IS NULL`];

  if (filters.search) conditions.push(Prisma.sql`"description" ILIKE ${`%${filters.search}%`}`);
  if (filters.type) conditions.push(Prisma.sql`"type" = ${filters.type}::"TransactionType"`);
  if (filters.categoryId) conditions.push(Prisma.sql`"categoryId" = ${filters.categoryId}`);
  if (filters.accountId) conditions.push(Prisma.sql`"accountId" = ${filters.accountId}`);
  if (filters.cardId) conditions.push(Prisma.sql`"cardId" = ${filters.cardId}`);
  if (filters.isPaid !== undefined) conditions.push(Prisma.sql`"isPaid" = ${filters.isPaid}`);
  if (filters.isTransfer === true) conditions.push(Prisma.sql`"transferId" IS NOT NULL`);
  if (filters.isTransfer === false) conditions.push(Prisma.sql`"transferId" IS NULL`);
  if (filters.tagId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "TransactionTag" tt WHERE tt."transactionId" = "Transaction"."id" AND tt."tagId" = ${filters.tagId})`,
    );
  }
  if (filters.dateFrom) conditions.push(Prisma.sql`COALESCE("paidAt", "date") >= ${filters.dateFrom}`);
  if (filters.dateTo) conditions.push(Prisma.sql`COALESCE("paidAt", "date") <= ${filters.dateTo}`);
  if (filters.amountMin) conditions.push(Prisma.sql`"amount" >= ${filters.amountMin}::numeric`);
  if (filters.amountMax) conditions.push(Prisma.sql`"amount" <= ${filters.amountMax}::numeric`);

  return conditions;
}

// Sort "Data" ordena por `createdAt` (ordem de CADASTRO), não pela data
// efetiva (`COALESCE("paidAt", "date")`). Transação agendada/futura (ex.:
// parcela de financiamento a pagar) tem `date` no futuro e não pode pular na
// frente de lançamentos de hoje/ontem na listagem. `amount_asc` mantém
// `createdAt DESC` no desempate — comportamento pré-existente preservado (não
// é uma regra nova desta mudança).
const SORT_ORDER_SQL: Record<TransactionSort, Prisma.Sql> = {
  date_desc: Prisma.sql`"createdAt" DESC`,
  date_asc: Prisma.sql`"createdAt" ASC`,
  amount_desc: Prisma.sql`"amount" DESC, "createdAt" DESC`,
  amount_asc: Prisma.sql`"amount" ASC, "createdAt" DESC`,
};

/**
 * Única listagem paginada do app (docs/01-STACK.md, "Performance"). Ordenar
 * por data EFETIVA exige `COALESCE("paidAt", "date")` no `ORDER BY`, que o
 * Prisma não expressa em `orderBy` tipado — daí a query em 2 passos: (1) SQL
 * cru resolve SÓ os `id`s da página, já filtrados e ordenados corretamente
 * (`buildListConditions` + `SORT_ORDER_SQL`, com `COUNT(*)` em paralelo pro
 * total); (2) `findMany` tipado (com `include: TAG_INCLUDE`) busca as linhas
 * completas desses ids — sem reimplementar em SQL cru o carregamento das
 * relações (tags, `loan.kind`). Os resultados do passo 2 são reordenados pela
 * ordem dos ids do passo 1 (`findMany` com `id: { in }}` não preserva ordem).
 * Effect colateral aceito: 1 round-trip a mais que o `findMany`+`count` em
 * paralelo de antes — tradeoff necessário pra ordenação correta por data
 * efetiva, sem risco de N+1 (sempre 2-3 queries, nunca por linha).
 */
async function list(
  userId: string,
  filters: TransactionListFilter,
  page: TransactionListPage,
): Promise<{ items: TransactionWithTags[]; total: number }> {
  const conditions = buildListConditions(userId, filters);
  const whereSql = Prisma.join(conditions, " AND ");
  const orderBySql = SORT_ORDER_SQL[page.sort];
  const skip = (page.page - 1) * page.pageSize;

  const [idRows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Transaction"
      WHERE ${whereSql}
      ORDER BY ${orderBySql}
      LIMIT ${page.pageSize} OFFSET ${skip}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "Transaction"
      WHERE ${whereSql}
    `,
  ]);

  const total = Number(countRows[0]?.count ?? 0);
  const ids = idRows.map((row) => row.id);
  if (ids.length === 0) return { items: [], total };

  const items: TransactionWithTags[] = await prisma.transaction.findMany({
    where: { id: { in: ids }, userId, deletedAt: null },
    include: TAG_INCLUDE,
  });

  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = ids
    .map((id) => itemById.get(id))
    .filter((item): item is TransactionWithTags => item !== undefined);

  return { items: orderedItems, total };
}

/**
 * Soma de `amount` por `type`, no MESMO filtro (`buildListConditions`) da
 * listagem paginada — nunca diverge do WHERE de `list` porque reaproveita o
 * mesmo builder. Insumo do resumo "N lançamentos · Entradas · Saídas ·
 * Resultado líquido" da Faixa 3 do card de filtros (`TransactionFiltersBar`),
 * calculado sobre TODO o resultado filtrado, não só a página carregada.
 */
async function sumByType(
  userId: string,
  filters: TransactionListFilter,
): Promise<{ type: TransactionType; total: Prisma.Decimal }[]> {
  const conditions = buildListConditions(userId, filters);
  const whereSql = Prisma.join(conditions, " AND ");

  const rows = await prisma.$queryRaw<{ type: TransactionType; total: Prisma.Decimal | string | number }[]>`
    SELECT "type", COALESCE(SUM("amount"), 0) AS total
    FROM "Transaction"
    WHERE ${whereSql}
    GROUP BY "type"
  `;

  return rows.map((row) => ({ type: row.type, total: new Prisma.Decimal(row.total) }));
}

/** Transação mais recente (por `date`, depois `createdAt`) de um tipo — base do default de cadastro rápido (docs/05-UX_RULES.md). */
async function findMostRecentByType(
  userId: string,
  type: TransactionType,
): Promise<(Transaction & { category: Category | null }) | null> {
  return prisma.transaction.findFirst({
    where: { userId, type, categoryId: { not: null }, deletedAt: null },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

/**
 * Descrições DISTINTAS do usuário que combinam com `query` (`contains`,
 * case-insensitive) — insumo do autocomplete do campo Descrição (docs/
 * 20-TRANSACTIONS.md). `groupBy` rankeia direto no banco por frequência
 * (`_count` desc) e recência (`_max(date)` desc) — sem dedupe/rank em memória.
 */
async function findDescriptionSuggestions(userId: string, query: string, limit: number): Promise<string[]> {
  const grouped = await prisma.transaction.groupBy({
    by: ["description"],
    where: { userId, deletedAt: null, description: { contains: query, mode: "insensitive" } },
    _count: { description: true },
    _max: { date: true },
    orderBy: [{ _count: { description: "desc" } }, { _max: { date: "desc" } }],
    take: limit,
  });

  return grouped.map((row) => row.description);
}

/**
 * Descrições DISTINTAS do usuário por frequência (`_count` desc) — sem filtro
 * de texto, diferente de `findDescriptionSuggestions` (autocomplete). Insumo
 * de `transactionService.listKnownMerchants` (docs/30-TELEGRAM.md, "Parsing
 * por IA"): as `limit` descrições mais usadas viram candidatas a "merchant
 * conhecido" pro prompt do Gemini.
 */
async function findDescriptionFrequencies(
  userId: string,
  limit: number,
): Promise<{ description: string; count: number }[]> {
  const grouped = await prisma.transaction.groupBy({
    by: ["description"],
    where: { userId, deletedAt: null },
    _count: { description: true },
    orderBy: { _count: { description: "desc" } },
    take: limit,
  });

  return grouped.map((row) => ({ description: row.description, count: row._count.description }));
}

/**
 * Contagem de lançamentos por (descrição, categoria) restrita a um conjunto
 * de descrições já conhecidas — insumo de `transactionService.
 * listKnownMerchants` pra achar a categoria DOMINANTE de cada merchant.
 * `categoryId: { not: null }` exclui `CARD_PAYMENT` (categoria sempre null,
 * docs/24-CATEGORIES.md) do cômputo. Ordenado por contagem desc GLOBALMENTE
 * (não por descrição) de propósito: o service escolhe a categoria dominante
 * de cada descrição pegando a 1ª ocorrência dela nesta lista, o que só
 * funciona porque a maior contagem de cada grupo aparece antes de qualquer
 * contagem menor do mesmo grupo nessa ordenação global.
 */
async function findCategoryCountsByDescriptions(
  userId: string,
  descriptions: string[],
): Promise<{ description: string; categoryId: string; count: number }[]> {
  if (descriptions.length === 0) return [];

  const grouped = await prisma.transaction.groupBy({
    by: ["description", "categoryId"],
    where: { userId, deletedAt: null, description: { in: descriptions }, categoryId: { not: null } },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: "desc" } },
  });

  return grouped
    .filter((row): row is typeof row & { categoryId: string } => row.categoryId !== null)
    .map((row) => ({ description: row.description, categoryId: row.categoryId, count: row._count.categoryId }));
}

/**
 * Transação mais recente (por `date`, depois `createdAt`) com uma descrição
 * EXATA — insumo do bônus "pré-preencher categoria" ao escolher uma sugestão
 * do autocomplete de Descrição (mesma regra de `findMostRecentByType`, mas
 * por descrição em vez de tipo).
 */
async function findMostRecentByDescription(
  userId: string,
  description: string,
): Promise<(Transaction & { category: Category | null }) | null> {
  return prisma.transaction.findFirst({
    where: {
      userId,
      description: { equals: description, mode: "insensitive" },
      categoryId: { not: null },
      deletedAt: null,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { category: true },
  });
}

/**
 * Soma de Transactions por tipo numa janela de datas — insumo dos KPIs
 * mensais (ver service.ts `monthlyExpenseTotal`/`monthlyIncomeTotal`/
 * `monthlyUnpaidExpenseTotal`). Exclui pernas de transferência
 * (`transferId: null`). `isPaid` default `true` (regra dos KPIs de
 * receita/despesa); `monthlyUnpaidExpenseTotal` passa `false` pro bloco
 * "Previsto / A Pagar" (docs/11-DASHBOARD.md).
 */
async function sumAmountByTypeInRange(
  userId: string,
  type: TransactionType,
  range: { gte: Date; lt: Date },
  isPaid = true,
): Promise<Prisma.Decimal> {
  // KPIs mensais são FLUXO DE CAIXA (conta): compra no cartão de crédito é
  // dívida (accrual), não saída de dinheiro — entra no caixa quando a fatura é
  // paga (EXPENSE da conta), então `cardId IS NULL` evita dobrar. O mês é o do
  // MOVIMENTO do dinheiro: `paidAt` quando paga (pagamento antecipado cai no
  // mês do pagamento, não do vencimento), `date` quando prevista
  // (isPaid=false ⇒ paidAt sempre null). O aggregate do Prisma não expressa
  // COALESCE no filtro, daí o $queryRaw parametrizado.
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal | string | number }[]>`
    SELECT COALESCE(SUM("amount"), 0) AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND "isPaid" = ${isPaid}
      AND "type" = ${type}::"TransactionType"
      AND "transferId" IS NULL
      AND "cardId" IS NULL
      AND COALESCE("paidAt", "date") >= ${range.gte}
      AND COALESCE("paidAt", "date") < ${range.lt}
  `;

  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

/**
 * Despesa do FLUXO DE CAIXA numa janela — EXPENSE (gasto direto na conta) +
 * CARD_PAYMENT (pagamento de fatura = saída de caixa, SEMPRE, com ou sem
 * `cardId` — pode ter `cardId` quando pago via pay-invoice.ts, que só
 * identifica qual fatura foi paga, não é uma compra). Mesma base conta-only de
 * `sumAmountByTypeInRange`, mas soma os DOIS tipos que compõem a saída de caixa
 * (docs/28-REPORTS.md). `cardId IS NULL` só vale pra EXPENSE — exclui a compra
 * no cartão em si (accrual, não é caixa ainda); compra no cartão entra só
 * quando a fatura é paga, sem double-count. Insumo do Weekly Summary e dos
 * Green alerts, pra bater com o KPI "Despesas" do Dashboard (`reports`
 * `sumCashflowInRange`, mesma regra).
 */
async function sumCashExpenseInRange(
  userId: string,
  range: { gte: Date; lt: Date },
  isPaid = true,
): Promise<Prisma.Decimal> {
  const rows = await prisma.$queryRaw<{ total: Prisma.Decimal | string | number }[]>`
    SELECT COALESCE(SUM("amount"), 0) AS total
    FROM "Transaction"
    WHERE "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND "isPaid" = ${isPaid}
      AND (("type" = 'EXPENSE' AND "cardId" IS NULL) OR "type" = 'CARD_PAYMENT')
      AND "transferId" IS NULL
      AND COALESCE("paidAt", "date") >= ${range.gte}
      AND COALESCE("paidAt", "date") < ${range.lt}
  `;
  return new Prisma.Decimal(rows[0]?.total ?? 0);
}

/** Agrupamento de despesas por categoria numa janela — insumo do gráfico de gastos por categoria. */
async function groupExpensesByCategoryInRange(
  userId: string,
  range: { gte: Date; lt: Date },
): Promise<ExpenseCategoryGroup[]> {
  const rows = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      deletedAt: null,
      isPaid: true,
      type: TransactionType.EXPENSE,
      transferId: null,
      date: { gte: range.gte, lt: range.lt },
    },
    _sum: { amount: true },
  });

  return rows.map((row) => ({ categoryId: row.categoryId, sum: row._sum.amount ?? new Prisma.Decimal(0) }));
}

/**
 * `userId` opcional (L7, defesa em profundidade): hoje os ids sempre vêm de
 * uma agregação já escopada por `userId` (`groupExpensesByCategoryInRange`),
 * sem exploit atual. Opcional em vez de obrigatório de propósito — outros
 * callers deste repository (`transactions/service.ts`, `alerts/anomaly.ts`)
 * ficam fora do escopo desta task; tornar `userId` obrigatório quebraria a
 * assinatura sem atualizar esses call sites. Novo código deve sempre passar
 * `userId`.
 */
async function findCategoryNamesByIds(ids: string[], userId?: string): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const categories = await prisma.category.findMany({
    where: { id: { in: ids }, ...(userId && { userId }) },
    select: { id: true, name: true },
  });

  return new Map(categories.map((category) => [category.id, category.name]));
}

/**
 * `installmentsCount` de um conjunto de `InstallmentPurchase` — insumo do
 * badge "N/total" na listagem de Transactions (docs/23-INSTALLMENTS.md,
 * "Regra de UX Principal"). Escopado por `userId` (isolamento, docs/10-AUTH.md).
 */
async function findInstallmentTotalsByIds(userId: string, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();

  const purchases = await prisma.installmentPurchase.findMany({
    where: { id: { in: ids }, userId },
    select: { id: true, installmentsCount: true },
  });

  return new Map(purchases.map((purchase) => [purchase.id, purchase.installmentsCount]));
}

/** Ownership check de uma `InstallmentPurchase` — insumo de `installments.ts` `cancelInstallmentPurchase` (docs/10-AUTH.md). */
async function findInstallmentPurchaseById(
  userId: string,
  id: string,
): Promise<{ id: string } | null> {
  return prisma.installmentPurchase.findFirst({ where: { id, userId }, select: { id: true } });
}

/**
 * Soft-delete das parcelas (`Transaction`) FUTURAS (`date > cutoff`) ainda
 * vivas de uma compra parcelada — insumo de `installments.ts`
 * `cancelInstallmentPurchase` (docs/23-INSTALLMENTS.md, "Cancelamento").
 * Parcelas com `date <= cutoff` (já vencidas/pagas) nunca são tocadas aqui —
 * mesmo padrão de `loanRepository.softDeleteUnpaidInstallments`. Escopado por
 * `userId` além de `installmentPurchaseId` — defesa em profundidade, mesmo o
 * `installmentPurchaseId` já vindo de uma compra validada pelo chamador.
 */
async function softDeleteFutureInstallments(
  userId: string,
  installmentPurchaseId: string,
  cutoff: Date,
  db: Db = prisma,
): Promise<void> {
  await db.transaction.updateMany({
    where: { userId, installmentPurchaseId, date: { gt: cutoff }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/**
 * Atualiza `categoryId` de TODAS as parcelas vivas de uma compra — fonte
 * única da categoria (docs/23-INSTALLMENTS.md: não há categoryId no pai).
 * Parcelas soft-deletadas (cancelamento) ficam intactas.
 */
async function updateCategoryForInstallmentPurchase(
  userId: string,
  installmentPurchaseId: string,
  categoryId: string,
  db: Db = prisma,
): Promise<number> {
  const result = await db.transaction.updateMany({
    where: { userId, installmentPurchaseId, deletedAt: null },
    data: { categoryId },
  });
  return result.count;
}

/**
 * Preview do Dashboard (docs/11-DASHBOARD.md, "Últimas Transações") — resolve
 * nome de categoria/conta/cartão e dados de parcelamento direto no `select`,
 * sem N+1. Não reaproveita `TAG_INCLUDE`/`list`: essa tela não precisa de
 * tags, mas precisa de nomes já resolvidos (não só ids).
 */
async function listRecentForDashboard(userId: string, limit: number): Promise<RecentTransactionRow[]> {
  const rows = await prisma.transaction.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      description: true,
      type: true,
      amount: true,
      date: true,
      isPaid: true,
      transferId: true,
      installmentNumber: true,
      category: { select: { name: true, color: true } },
      account: { select: { name: true } },
      card: { select: { name: true } },
      installmentPurchase: { select: { installmentsCount: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    type: row.type,
    amount: row.amount,
    date: row.date,
    isPaid: row.isPaid,
    transferId: row.transferId,
    categoryName: row.category?.name ?? null,
    categoryColor: row.category?.color ?? null,
    accountName: row.account?.name ?? null,
    cardName: row.card?.name ?? null,
    installmentNumber: row.installmentNumber,
    installmentsCount: row.installmentPurchase?.installmentsCount ?? null,
  }));
}

/**
 * Compras parceladas do usuário (TODAS, ativas ou finalizadas) + parcelas
 * (`Transaction`) não deletadas + nome do cartão — insumo do progresso
 * derivado (ver service.ts `listInstallmentPurchasesWithProgress`,
 * docs/23-INSTALLMENTS.md "Valores Derivados"). Sem agregação aqui: a
 * derivação (paga/restante) depende de "hoje", que é regra do service, não
 * do acesso a dados. `cardId` opcional filtra pelo cartão (filtro da tela
 * `/installments`).
 */
async function listInstallmentPurchasesWithTransactions(
  userId: string,
  cardId?: string,
): Promise<InstallmentPurchaseRow[]> {
  const purchases = await prisma.installmentPurchase.findMany({
    where: { userId, ...(cardId ? { cardId } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      description: true,
      totalAmount: true,
      installmentsCount: true,
      card: { select: { name: true } },
      transactions: {
        where: { deletedAt: null },
        select: {
          installmentNumber: true,
          amount: true,
          date: true,
          categoryId: true,
          category: { select: { name: true } },
        },
        orderBy: { date: "asc" },
      },
    },
  });

  return purchases.map((purchase) => {
    const first = purchase.transactions[0];
    return {
      id: purchase.id,
      description: purchase.description,
      totalAmount: purchase.totalAmount,
      installmentsCount: purchase.installmentsCount,
      cardName: purchase.card.name,
      categoryId: first?.categoryId ?? null,
      categoryName: first?.category?.name ?? null,
      transactions: purchase.transactions.map((transaction) => ({
        installmentNumber: transaction.installmentNumber,
        amount: transaction.amount,
        date: transaction.date,
      })),
    };
  });
}

export const transactionRepository = {
  findById,
  findDeletedById,
  create,
  update,
  softDelete,
  softDeleteByTransferId,
  restore,
  restoreByTransferId,
  list,
  sumByType,
  findMostRecentByType,
  findDescriptionSuggestions,
  findDescriptionFrequencies,
  findCategoryCountsByDescriptions,
  findMostRecentByDescription,
  sumAmountByTypeInRange,
  sumCashExpenseInRange,
  groupExpensesByCategoryInRange,
  findCategoryNamesByIds,
  findInstallmentTotalsByIds,
  findInstallmentPurchaseById,
  softDeleteFutureInstallments,
  updateCategoryForInstallmentPurchase,
  listRecentForDashboard,
  listInstallmentPurchasesWithTransactions,
};
