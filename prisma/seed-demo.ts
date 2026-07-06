/**
 * Seed de DEMONSTRAÇÃO — usuário isolado `demo@personalfinance.app`, populado
 * com ~4 meses de dados fictícios realistas (contas, cartões, transações,
 * parcelamentos, orçamentos, patrimônio e alertas) para o dono navegar o app
 * cheio sem tocar nos usuários reais (`prisma/seed.ts`).
 *
 * Idempotente por DESIGN "apaga e recria" (não upsert-por-conteúdo): o
 * usuário demo é upsertado por email (mesmo `id` entre execuções), mas TODOS
 * os dados que ele possui são apagados (`wipeDemoData`, em ordem segura de FK)
 * e recriados do zero a cada rodada — rodar 2x nunca duplica nada. Usa os
 * SERVICES dos módulos sempre que possível (respeitam invariantes: 2 pernas
 * de transferência, rateio de parcela, snapshot atômico de patrimônio etc.);
 * cai pro Prisma client direto só onde o service não expõe a operação
 * (wipe em massa, snapshots retroativos de patrimônio).
 *
 * Rodar: `npx tsx prisma/seed-demo.ts` (ou `npm run db:seed-demo`).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { addMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { prisma } from "@/lib/db/client";
import { TransactionType, CategoryType, AccountType, AssetType } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { TIMEZONE, parseInSaoPaulo } from "@/lib/date/timezone";
import { calendarPartsSP, daysInMonthSP } from "@/lib/date/calendar-sp";
import { accountService } from "@/modules/accounts/service";
import { createTransfer } from "@/modules/accounts/transfer";
import { transactionService } from "@/modules/transactions/service";
import { createInstallmentPurchase } from "@/modules/transactions/installments";
import { cardService } from "@/modules/cards/service";
import { budgetService } from "@/modules/budgets/service";
import { assetService } from "@/modules/assets/service";
import { alertService } from "@/modules/alerts/service";
import { settingsService } from "@/modules/settings/service";
import { getClosedWeekWindow, getPrecedingWeekWindows, type WeekWindow } from "@/modules/alerts/week";
import { BASELINE_WEEKS } from "@/modules/alerts/anomaly";

const DEMO_EMAIL = "demo@personalfinance.app";
const DEMO_PASSWORD = "demo1234";
const DEMO_NAME = "Conta Demo";
const BCRYPT_SALT_ROUNDS = 10;

/** Semanas extras ANTES da janela de baseline (8 semanas) — total ≈ EXTRA + 8 + 1 semanas de histórico (~4 meses). */
const EXTRA_OLDER_WEEKS = 8;

type IdMap = Map<string, string>;

// ---------------------------------------------------------------------------
// Árvore de categorias — mesma de prisma/seed.ts (docs/24-CATEGORIES.md).
// Duplicada aqui de propósito (rule 02-dry-kiss-yagni: 2 ocorrências é
// aceitável; seed.ts e seed-demo.ts têm ciclos de vida/escopo diferentes —
// um nunca deve importar o outro).
// ---------------------------------------------------------------------------
type CategorySeed = { name: string; type: CategoryType; children: string[] };

const EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: "Alimentação", type: CategoryType.EXPENSE, children: ["Mercado", "Restaurante/Lanche", "Delivery", "Padaria"] },
  {
    name: "Casa",
    type: CategoryType.EXPENSE,
    children: ["Aluguel/Financiamento", "Energia", "Água", "Gás", "Internet", "Telefone", "Condomínio", "Manutenção"],
  },
  {
    name: "Transporte",
    type: CategoryType.EXPENSE,
    children: ["Combustível", "Uber/99/Táxi", "Transporte público", "Estacionamento", "Manutenção do carro", "IPVA/Seguro"],
  },
  { name: "Saúde", type: CategoryType.EXPENSE, children: ["Plano de saúde", "Farmácia", "Consultas", "Academia"] },
  {
    name: "Lazer",
    type: CategoryType.EXPENSE,
    children: ["Streaming/Assinaturas", "Cinema/Shows", "Viagens", "Restaurantes", "Hobbies"],
  },
  { name: "Educação", type: CategoryType.EXPENSE, children: ["Cursos", "Livros", "Mensalidade"] },
  { name: "Compras", type: CategoryType.EXPENSE, children: ["Vestuário", "Eletrônicos", "Presentes", "Casa/Decoração"] },
  { name: "Filhos/Pets", type: CategoryType.EXPENSE, children: ["Escola", "Creche", "Pet"] },
  {
    name: "Finanças",
    type: CategoryType.EXPENSE,
    children: ["Tarifas bancárias", "Juros", "Impostos", "Investimento (aporte)"],
  },
  { name: "Outros", type: CategoryType.EXPENSE, children: [] },
];

const INCOME_CATEGORIES: CategorySeed[] = [
  { name: "Salário", type: CategoryType.INCOME, children: [] },
  { name: "Freelance/Extra", type: CategoryType.INCOME, children: [] },
  { name: "Rendimentos", type: CategoryType.INCOME, children: [] },
  { name: "Reembolso", type: CategoryType.INCOME, children: [] },
  { name: "Presente/Doação", type: CategoryType.INCOME, children: [] },
  { name: "Outros (Receita)", type: CategoryType.INCOME, children: [] },
];

const CATEGORY_TREE: CategorySeed[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

// ---------------------------------------------------------------------------
// Helpers puros (random, dinheiro, datas em America/Sao_Paulo)
// ---------------------------------------------------------------------------

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomAmount(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

function pick<T>(items: T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function chance(probability: number): boolean {
  return Math.random() < probability;
}

/** Nunca float no domínio (docs/03-DATABASE.md) — string decimal com 2 casas na borda do service. */
function money(value: number): string {
  return value.toFixed(2);
}

/** `n` meses atrás de agora, meia-noite (America/Sao_Paulo) preservada via zoned arithmetic (mesmo padrão de `installments.ts`). */
function monthsAgo(n: number): Date {
  const zonedNow = toZonedTime(new Date(), TIMEZONE);
  return parseInSaoPaulo(addMonths(zonedNow, -n));
}

/** `n` dias a partir de agora, ~meio-dia (America/Sao_Paulo) — usado nas despesas previstas (`isPaid=false`). */
function daysFromNow(n: number): Date {
  const zonedNow = toZonedTime(new Date(), TIMEZONE);
  const local = new Date(zonedNow.getFullYear(), zonedNow.getMonth(), zonedNow.getDate(), 12, 0, 0, 0);
  local.setDate(local.getDate() + n);
  return parseInSaoPaulo(local);
}

/** Dia `dayOffset` (0=domingo..6=sábado) dentro da semana `week`, em torno de `hour` (America/Sao_Paulo). */
function dateInWeek(week: WeekWindow, dayOffset: number, hour: number): Date {
  const zonedStart = toZonedTime(week.gte, TIMEZONE);
  const local = new Date(zonedStart.getFullYear(), zonedStart.getMonth(), zonedStart.getDate(), hour, randomInt(0, 59), 0, 0);
  local.setDate(local.getDate() + dayOffset);
  return parseInSaoPaulo(local);
}

/** Dia `day` (clampado ao mês) de `year`/`month`, às `hour`h (America/Sao_Paulo) — usado pelas contas fixas mensais. */
function dayInMonth(year: number, month: number, day: number, hour: number): Date {
  const clampedDay = Math.min(day, daysInMonthSP(year, month));
  return parseInSaoPaulo(new Date(year, month - 1, clampedDay, hour, 0, 0, 0));
}

function monthsInRange(
  start: { year: number; month: number },
  end: { year: number; month: number },
): Array<{ year: number; month: number }> {
  const list: Array<{ year: number; month: number }> = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    list.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return list;
}

// ---------------------------------------------------------------------------
// Usuário demo + wipe idempotente
// ---------------------------------------------------------------------------

async function upsertDemoUser(): Promise<User> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_SALT_ROUNDS);

  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: DEMO_NAME, passwordHash },
    create: { name: DEMO_NAME, email: DEMO_EMAIL, passwordHash },
  });
}

/**
 * Apaga TODOS os dados do usuário demo em ordem segura de FK (docs/03-DATABASE.md
 * usa `onDelete: Restrict` na maioria das relações — child sempre antes do
 * parent que ele referencia). `User`/`UserSettings` nunca são apagados aqui:
 * o `id` do usuário demo permanece estável entre execuções (upsert por email).
 */
async function wipeDemoData(userId: string): Promise<void> {
  await prisma.alert.deleteMany({ where: { userId } });
  await prisma.budget.deleteMany({ where: { userId } }); // referencia Category (Restrict)
  await prisma.recurringTransaction.deleteMany({ where: { userId } }); // referencia Category/Account (Restrict)
  await prisma.transaction.deleteMany({ where: { userId } }); // referencia Category/Account/Card/InstallmentPurchase (Restrict); TransactionTag cascateia
  await prisma.installmentPurchase.deleteMany({ where: { userId } }); // referencia Card (Restrict)
  await prisma.card.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.asset.deleteMany({ where: { userId } }); // AssetSnapshot cascateia (onDelete: Cascade)
  await prisma.tag.deleteMany({ where: { userId } });
  await prisma.category.deleteMany({ where: { userId, parentId: { not: null } } }); // filhas antes (self-FK Restrict)
  await prisma.category.deleteMany({ where: { userId, parentId: null } });
}

// ---------------------------------------------------------------------------
// Categorias, contas, cartões
// ---------------------------------------------------------------------------

async function seedCategories(userId: string): Promise<IdMap> {
  const idByName: IdMap = new Map();

  for (const parent of CATEGORY_TREE) {
    const parentRow = await prisma.category.create({
      data: { userId, name: parent.name, type: parent.type, parentId: null },
    });
    idByName.set(parent.name, parentRow.id);

    for (const childName of parent.children) {
      const childRow = await prisma.category.create({
        data: { userId, name: childName, type: parent.type, parentId: parentRow.id },
      });
      idByName.set(childName, childRow.id);
    }
  }

  return idByName;
}

async function seedAccounts(userId: string): Promise<IdMap> {
  const definitions = [
    { name: "Conta Corrente", type: AccountType.CHECKING, initialBalance: 3000 },
    { name: "Poupança", type: AccountType.SAVINGS, initialBalance: 12000 },
    { name: "Carteira", type: AccountType.CASH, initialBalance: 300 },
    { name: "Conta PJ", type: AccountType.BUSINESS, initialBalance: 4200 },
  ];

  const idByName: IdMap = new Map();
  for (const definition of definitions) {
    const account = await accountService.createAccount(userId, {
      name: definition.name,
      type: definition.type,
      initialBalance: money(definition.initialBalance),
    });
    idByName.set(definition.name, account.id);
  }

  return idByName;
}

async function seedCards(userId: string): Promise<IdMap> {
  const definitions = [
    { name: "Nubank", brand: "Mastercard", limit: 5000, closingDay: 10, dueDay: 17 },
    { name: "XP Visa", brand: "Visa", limit: 3000, closingDay: 25, dueDay: 5 },
  ];

  const idByName: IdMap = new Map();
  for (const definition of definitions) {
    const card = await cardService.createCard(userId, {
      name: definition.name,
      brand: definition.brand,
      limit: money(definition.limit),
      closingDay: definition.closingDay,
      dueDay: definition.dueDay,
    });
    idByName.set(definition.name, card.id);
  }

  return idByName;
}

// ---------------------------------------------------------------------------
// Transações — helper comum + receitas semanais/mensais
// ---------------------------------------------------------------------------

type Source = { accountId?: string; cardId?: string };

/** TRANSFER nunca é criada por este módulo (nasce como 2 pernas via `createTransfer`) — mesmo recorte de `transactions/schemas.ts`. */
type CreatableTransactionType = Extract<TransactionType, "INCOME" | "EXPENSE" | "CARD_PAYMENT">;

async function createTx(
  userId: string,
  input: {
    description: string;
    type: CreatableTransactionType;
    amount: number;
    date: Date;
    categoryId?: string;
    source?: Source;
    isPaid?: boolean;
  },
): Promise<void> {
  await transactionService.createTransaction(userId, {
    description: input.description,
    type: input.type,
    amount: money(input.amount),
    categoryId: input.categoryId,
    accountId: input.source?.accountId,
    cardId: input.source?.cardId,
    date: input.date,
    isPaid: input.isPaid ?? true,
    tagIds: [],
  });
}

type WeeklyRecipe = {
  category: string;
  descriptions: string[];
  amount: [number, number];
  occurrences: [number, number];
  sources: Source[];
};

/** Gastos recorrentes de padrão SEMANAL (docs/06-SCREENS.md categorias mais comuns do dia a dia). */
function buildWeeklyRecipes(accounts: IdMap, cards: IdMap): WeeklyRecipe[] {
  const corrente = accounts.get("Conta Corrente")!;
  const carteira = accounts.get("Carteira")!;
  const nubank = cards.get("Nubank")!;
  const xp = cards.get("XP Visa")!;

  return [
    {
      category: "Mercado",
      descriptions: ["Supermercado Extra", "Supermercado Pão de Açúcar", "Mercadinho do bairro"],
      amount: [220, 420],
      occurrences: [1, 1],
      sources: [{ accountId: corrente }, { cardId: xp }],
    },
    {
      category: "Restaurante/Lanche",
      descriptions: ["Restaurante", "Hamburgueria", "Pizzaria", "Lanchonete"],
      amount: [35, 110],
      occurrences: [0, 1],
      sources: [{ cardId: nubank }, { cardId: xp }, { accountId: carteira }],
    },
    {
      category: "Delivery",
      descriptions: ["iFood", "Rappi"],
      amount: [45, 95],
      occurrences: [0, 1],
      sources: [{ cardId: nubank }],
    },
    {
      category: "Uber/99/Táxi",
      descriptions: ["Uber", "99"],
      amount: [15, 45],
      occurrences: [0, 1],
      sources: [{ accountId: carteira }, { cardId: nubank }],
    },
    {
      category: "Combustível",
      descriptions: ["Posto Shell", "Posto Ipiranga"],
      amount: [150, 260],
      occurrences: [0, 1],
      sources: [{ accountId: corrente }, { cardId: xp }],
    },
  ];
}

async function seedWeekFromRecipes(
  userId: string,
  week: WeekWindow,
  recipes: WeeklyRecipe[],
  categories: IdMap,
): Promise<number> {
  let count = 0;

  for (const recipe of recipes) {
    const occurrences = randomInt(recipe.occurrences[0], recipe.occurrences[1]);
    for (let i = 0; i < occurrences; i += 1) {
      await createTx(userId, {
        description: pick(recipe.descriptions),
        type: TransactionType.EXPENSE,
        amount: randomAmount(recipe.amount[0], recipe.amount[1]),
        date: dateInWeek(week, randomInt(0, 6), 12),
        categoryId: categories.get(recipe.category)!,
        source: pick(recipe.sources),
      });
      count += 1;
    }
  }

  return count;
}

/**
 * Farmácia isolada da lista genérica de propósito: é a categoria usada pro
 * alerta GREEN (docs/29-ALERTS.md, condição a) — controlada semana a semana
 * por `seedTransactionHistory` (baseline com gasto, semana fechada SEM gasto).
 */
async function seedFarmacia(userId: string, week: WeekWindow, accounts: IdMap, cards: IdMap, categories: IdMap): Promise<number> {
  await createTx(userId, {
    description: pick(["Drogasil", "Farmácia São Paulo", "Pague Menos"]),
    type: TransactionType.EXPENSE,
    amount: randomAmount(40, 140),
    date: dateInWeek(week, randomInt(0, 6), 15),
    categoryId: categories.get("Farmácia")!,
    source: chance(0.5) ? { accountId: accounts.get("Conta Corrente")! } : { cardId: cards.get("XP Visa")! },
  });
  return 1;
}

/**
 * Gasto único em "Viagens" na semana fechada mais recente, categoria SEM
 * nenhum outro lançamento no dataset — baseline das 8 semanas anteriores fica
 * em zero, então `detectAnomalies` (docs/29-ALERTS.md) dispara garantidamente
 * (`weekAmount > baseline(0) * multiplier` e `weekAmount > alertMinimumAmount`).
 */
async function seedAnomalyTrip(userId: string, week: WeekWindow, cards: IdMap, categories: IdMap): Promise<number> {
  await createTx(userId, {
    description: "Pacote de viagem - fim de semana",
    type: TransactionType.EXPENSE,
    amount: randomAmount(650, 900),
    date: dateInWeek(week, 5, 10),
    categoryId: categories.get("Viagens")!,
    source: { cardId: cards.get("Nubank")! },
  });
  return 1;
}

type MonthlyRecipe = {
  category: string;
  type: CreatableTransactionType;
  descriptions: string[];
  amount: [number, number];
  day: number;
  source: Source;
  /** Probabilidade de ocorrer no mês (default 1 = todo mês). */
  chance?: number;
};

/** Contas fixas + salário — padrão MENSAL, num dia fixo do mês (docs/20-TRANSACTIONS.md). */
function buildMonthlyRecipes(accounts: IdMap, cards: IdMap): MonthlyRecipe[] {
  const corrente = accounts.get("Conta Corrente")!;
  const nubank = cards.get("Nubank")!;
  const xp = cards.get("XP Visa")!;

  return [
    { category: "Salário", type: TransactionType.INCOME, descriptions: ["Salário mensal"], amount: [5800, 6200], day: 5, source: { accountId: corrente } },
    { category: "Condomínio", type: TransactionType.EXPENSE, descriptions: ["Condomínio"], amount: [420, 480], day: 6, source: { accountId: corrente } },
    { category: "Energia", type: TransactionType.EXPENSE, descriptions: ["Conta de luz - CPFL"], amount: [180, 260], day: 15, source: { accountId: corrente } },
    { category: "Água", type: TransactionType.EXPENSE, descriptions: ["Conta de água - Sabesp"], amount: [90, 140], day: 12, source: { accountId: corrente } },
    { category: "Internet", type: TransactionType.EXPENSE, descriptions: ["Internet fibra"], amount: [110, 130], day: 8, source: { accountId: corrente } },
    { category: "Telefone", type: TransactionType.EXPENSE, descriptions: ["Conta de celular"], amount: [55, 75], day: 18, source: { cardId: xp } },
    { category: "Academia", type: TransactionType.EXPENSE, descriptions: ["Mensalidade academia"], amount: [110, 140], day: 7, source: { cardId: nubank } },
    { category: "Streaming/Assinaturas", type: TransactionType.EXPENSE, descriptions: ["Netflix + Spotify"], amount: [50, 65], day: 20, source: { cardId: nubank } },
    { category: "Freelance/Extra", type: TransactionType.INCOME, descriptions: ["Projeto freelance"], amount: [700, 1300], day: 22, source: { accountId: corrente }, chance: 0.45 },
  ];
}

async function seedMonth(
  userId: string,
  year: number,
  month: number,
  recipes: MonthlyRecipe[],
  categories: IdMap,
  refDate: Date,
): Promise<number> {
  let count = 0;

  for (const recipe of recipes) {
    if (recipe.chance !== undefined && !chance(recipe.chance)) continue;

    const date = dayInMonth(year, month, recipe.day, 10);
    if (date.getTime() > refDate.getTime()) continue; // conta ainda não venceu/aconteceu

    await createTx(userId, {
      description: pick(recipe.descriptions),
      type: recipe.type,
      amount: randomAmount(recipe.amount[0], recipe.amount[1]),
      date,
      categoryId: categories.get(recipe.category)!,
      source: recipe.source,
    });
    count += 1;
  }

  return count;
}

/** Alguns lançamentos "de hoje" — dão sensação de dado fresco no dashboard. */
async function seedTodayExtras(userId: string, accounts: IdMap, categories: IdMap): Promise<number> {
  await createTx(userId, {
    description: "Padaria",
    type: TransactionType.EXPENSE,
    amount: randomAmount(12, 25),
    date: new Date(),
    categoryId: categories.get("Padaria")!,
    source: { accountId: accounts.get("Conta Corrente")! },
  });
  await createTx(userId, {
    description: "Uber",
    type: TransactionType.EXPENSE,
    amount: randomAmount(15, 30),
    date: new Date(),
    categoryId: categories.get("Uber/99/Táxi")!,
    source: { accountId: accounts.get("Carteira")! },
  });
  return 2;
}

/** Despesas "previstas" (docs/11-DASHBOARD.md, "Previsto/A Pagar") — `isPaid=false`, datadas nos próximos dias. */
async function seedUnpaidPreviews(userId: string, accounts: IdMap, cards: IdMap, categories: IdMap): Promise<number> {
  const items = [
    {
      description: "Conta de energia (prevista)",
      categoryId: categories.get("Energia")!,
      amount: randomAmount(190, 240),
      date: daysFromNow(3),
      source: { accountId: accounts.get("Conta Corrente")! },
    },
    {
      description: "Revisão do carro",
      categoryId: categories.get("Manutenção do carro")!,
      amount: randomAmount(280, 420),
      date: daysFromNow(6),
      source: { cardId: cards.get("XP Visa")! },
    },
    {
      description: "Presente de aniversário",
      categoryId: categories.get("Presentes")!,
      amount: randomAmount(120, 200),
      date: daysFromNow(9),
      source: { cardId: cards.get("Nubank")! },
    },
  ];

  for (const item of items) {
    await createTx(userId, {
      description: item.description,
      type: TransactionType.EXPENSE,
      amount: item.amount,
      date: item.date,
      categoryId: item.categoryId,
      source: item.source,
      isPaid: false,
    });
  }

  return items.length;
}

/**
 * Monta ~4 meses de histórico semana a semana (mais os itens mensais fixos),
 * alinhado às MESMAS janelas de semana que `modules/alerts` usa pra
 * baseline/anomalia (`getClosedWeekWindow`/`getPrecedingWeekWindows`,
 * reaproveitados em vez de reimplementar a aritmética de semana em SP).
 */
async function seedTransactionHistory(
  userId: string,
  accounts: IdMap,
  cards: IdMap,
  categories: IdMap,
): Promise<{ generic: number; farmacia: number; anomaly: number; today: number; unpaid: number }> {
  const refDate = new Date();
  const closedWeek = getClosedWeekWindow(refDate);
  const baselineWeeksNewestFirst = getPrecedingWeekWindows(closedWeek.gte, BASELINE_WEEKS);
  const olderWeeksNewestFirst = getPrecedingWeekWindows(
    baselineWeeksNewestFirst[baselineWeeksNewestFirst.length - 1].gte,
    EXTRA_OLDER_WEEKS,
  );

  const weeksOldestFirst: WeekWindow[] = [
    ...[...olderWeeksNewestFirst].reverse(),
    ...[...baselineWeeksNewestFirst].reverse(),
    closedWeek,
  ];
  const totalWeeks = weeksOldestFirst.length;

  const weeklyRecipes = buildWeeklyRecipes(accounts, cards);
  let generic = 0;
  let farmacia = 0;

  for (let index = 0; index < totalWeeks; index += 1) {
    const week = weeksOldestFirst[index];
    const isClosedWeek = index === totalWeeks - 1;
    const isBaselineWeek = index >= EXTRA_OLDER_WEEKS && !isClosedWeek;
    const isOldestBaselineWeek = index === EXTRA_OLDER_WEEKS;

    generic += await seedWeekFromRecipes(userId, week, weeklyRecipes, categories);

    // Farmácia nunca na semana fechada (garante o alerta GREEN por categoria);
    // sempre na semana de baseline mais antiga (garante baseline > 0).
    if (!isClosedWeek) {
      const shouldSeedFarmacia = isOldestBaselineWeek || chance(isBaselineWeek ? 0.65 : 0.4);
      if (shouldSeedFarmacia) farmacia += await seedFarmacia(userId, week, accounts, cards, categories);
    }
  }

  const anomaly = await seedAnomalyTrip(userId, closedWeek, cards, categories);

  const monthlyRecipes = buildMonthlyRecipes(accounts, cards);
  const oldestMonth = calendarPartsSP(weeksOldestFirst[0].gte);
  const newestMonth = calendarPartsSP(refDate);
  let monthly = 0;
  for (const { year, month } of monthsInRange(oldestMonth, newestMonth)) {
    monthly += await seedMonth(userId, year, month, monthlyRecipes, categories, refDate);
  }

  const today = await seedTodayExtras(userId, accounts, categories);
  const unpaid = await seedUnpaidPreviews(userId, accounts, cards, categories);

  return { generic: generic + monthly, farmacia, anomaly, today, unpaid };
}

// ---------------------------------------------------------------------------
// Transferências, parcelamentos, orçamentos, patrimônio
// ---------------------------------------------------------------------------

async function seedTransfers(userId: string, accounts: IdMap): Promise<number> {
  await createTransfer(userId, {
    fromAccountId: accounts.get("Conta Corrente")!,
    toAccountId: accounts.get("Poupança")!,
    amount: money(500),
    date: monthsAgo(2),
    description: "Transferência para poupança",
  });
  await createTransfer(userId, {
    fromAccountId: accounts.get("Conta Corrente")!,
    toAccountId: accounts.get("Carteira")!,
    amount: money(200),
    date: monthsAgo(1),
    description: "Saque para carteira",
  });
  return 2;
}

async function seedInstallments(userId: string, cards: IdMap, categories: IdMap): Promise<number> {
  await createInstallmentPurchase(userId, {
    cardId: cards.get("Nubank")!,
    description: "MacBook Pro 14 M4",
    totalAmount: money(11990),
    installmentsCount: 10,
    firstDueDate: monthsAgo(3),
    categoryId: categories.get("Eletrônicos")!,
  });
  await createInstallmentPurchase(userId, {
    cardId: cards.get("XP Visa")!,
    description: "Geladeira Brastemp Frost Free",
    totalAmount: money(4200),
    installmentsCount: 6,
    firstDueDate: monthsAgo(2),
    categoryId: categories.get("Casa/Decoração")!,
  });
  return 2;
}

/**
 * Orçamentos do mês atual tunados pra mostrar os 3 estados visuais
 * (docs/26-BUDGETS.md: Normal ≤80%, Atenção 80-100%, Estourado >100%):
 * cria com um `plannedAmount` placeholder, lê o `spentAmount` REAL já
 * lançado no mês (via `budgetService.spentAmount`, mesma conta que o
 * dashboard usa) e recalcula o planejado pra bater a progressão alvo.
 */
async function seedBudgets(userId: string, categories: IdMap): Promise<number> {
  const now = calendarPartsSP(new Date());
  const targets: Array<{ name: string; progress: number; minPlanned: number }> = [
    { name: "Alimentação", progress: 1.12, minPlanned: 700 },
    { name: "Casa", progress: 0.88, minPlanned: 900 },
    { name: "Transporte", progress: 0.55, minPlanned: 300 },
    { name: "Lazer", progress: 0.92, minPlanned: 200 },
    { name: "Saúde", progress: 0.45, minPlanned: 150 },
  ];

  let created = 0;
  for (const target of targets) {
    const categoryId = categories.get(target.name);
    if (!categoryId) continue;

    const placeholder = await budgetService.createBudget(userId, {
      categoryId,
      month: now.month,
      year: now.year,
      plannedAmount: "100.00",
    });

    const spent = Number((await budgetService.spentAmount(userId, placeholder)).toFixed(2));
    const planned = Math.max(target.minPlanned, spent > 0 ? spent / target.progress : target.minPlanned);

    await budgetService.updateBudget(userId, placeholder.id, { plannedAmount: money(planned) });
    created += 1;
  }

  return created;
}

type AssetPlan = {
  name: string;
  type: AssetType;
  purchaseValue: number;
  purchaseDate: Date;
  /** Valores ao longo do tempo, do mais antigo pro mais recente — o ÚLTIMO é aplicado via `assetService.updateAsset` (snapshot "agora"); os do meio via snapshot retroativo direto no Prisma. */
  path: Array<{ monthsAgo: number; value: number }>;
};

/**
 * Cria os assets + série de `AssetSnapshot` espalhada nos últimos meses
 * (docs/27-ASSETS.md, "Evolução"). `assetService.updateAsset` só sabe
 * carimbar o snapshot com "agora" (docs/27, regra central do módulo) —
 * pontos RETROATIVOS entram via Prisma direto, exatamente o caso que a task
 * arma pra cair fora do service.
 */
async function seedAssets(userId: string): Promise<{ assets: number; snapshots: number }> {
  const plans: AssetPlan[] = [
    {
      name: "Apartamento Centro",
      type: AssetType.PROPERTY,
      purchaseValue: 380000,
      purchaseDate: monthsAgo(36),
      path: [
        { monthsAgo: 4, value: 430000 },
        { monthsAgo: 3, value: 436000 },
        { monthsAgo: 1, value: 444000 },
        { monthsAgo: 0, value: 450000 },
      ],
    },
    {
      name: "Tesouro Direto",
      type: AssetType.INVESTMENT,
      purchaseValue: 70000,
      purchaseDate: monthsAgo(12),
      path: [
        { monthsAgo: 4, value: 78000 },
        { monthsAgo: 3, value: 80500 },
        { monthsAgo: 1, value: 83200 },
        { monthsAgo: 0, value: 85000 },
      ],
    },
    {
      name: "CDB Banco XP",
      type: AssetType.INVESTMENT,
      purchaseValue: 28000,
      purchaseDate: monthsAgo(8),
      path: [
        { monthsAgo: 4, value: 29500 },
        { monthsAgo: 3, value: 30400 },
        { monthsAgo: 1, value: 31300 },
        { monthsAgo: 0, value: 32000 },
      ],
    },
    {
      name: "Reserva de Emergência",
      type: AssetType.EMERGENCY_FUND,
      purchaseValue: 15000,
      purchaseDate: monthsAgo(12),
      path: [
        { monthsAgo: 4, value: 13000 },
        { monthsAgo: 3, value: 13800 },
        { monthsAgo: 1, value: 14600 },
        { monthsAgo: 0, value: 15000 },
      ],
    },
    {
      name: "Carro Onix 2022",
      type: AssetType.VEHICLE,
      purchaseValue: 60000,
      purchaseDate: monthsAgo(24),
      path: [
        { monthsAgo: 4, value: 45000 },
        { monthsAgo: 3, value: 43500 },
        { monthsAgo: 1, value: 41800 },
        { monthsAgo: 0, value: 40000 },
      ],
    },
  ];

  let snapshots = 0;
  for (const plan of plans) {
    const first = plan.path[0];
    const asset = await assetService.createAsset(userId, {
      name: plan.name,
      type: plan.type,
      purchaseValue: money(plan.purchaseValue),
      currentValue: money(first.value),
      purchaseDate: plan.purchaseDate,
    });

    for (const step of plan.path.slice(1, -1)) {
      await prisma.assetSnapshot.create({
        data: { assetId: asset.id, value: money(step.value), date: monthsAgo(step.monthsAgo) },
      });
      snapshots += 1;
    }

    const last = plan.path[plan.path.length - 1];
    await assetService.updateAsset(userId, asset.id, { currentValue: money(last.value) });
    snapshots += 1;
  }

  return { assets: plans.length, snapshots };
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------

async function printSummary(userId: string): Promise<void> {
  const [accounts, cards, categories, transactions, unpaidTransactions, installmentPurchases, budgets, assets, assetSnapshots, alerts] =
    await Promise.all([
      prisma.account.count({ where: { userId } }),
      prisma.card.count({ where: { userId } }),
      prisma.category.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId } }),
      prisma.transaction.count({ where: { userId, isPaid: false } }),
      prisma.installmentPurchase.count({ where: { userId } }),
      prisma.budget.count({ where: { userId } }),
      prisma.asset.count({ where: { userId } }),
      prisma.assetSnapshot.count({ where: { asset: { userId } } }),
      prisma.alert.count({ where: { userId } }),
    ]);

  console.log("\n=== Resumo do seed demo ===");
  console.log(`Contas: ${accounts}`);
  console.log(`Cartões: ${cards}`);
  console.log(`Categorias: ${categories}`);
  console.log(`Transações: ${transactions} (${unpaidTransactions} previstas/não pagas)`);
  console.log(`Compras parceladas: ${installmentPurchases}`);
  console.log(`Orçamentos: ${budgets}`);
  console.log(`Assets: ${assets}`);
  console.log(`AssetSnapshots: ${assetSnapshots}`);
  console.log(`Alertas: ${alerts}`);
}

async function main(): Promise<void> {
  const demoUser = await upsertDemoUser();
  await settingsService.getSettings(demoUser.id); // lazy find-or-create, mesmos defaults de prisma/seed.ts

  console.log(`Usuário demo: ${demoUser.email} (${demoUser.id})`);
  console.log("Apagando dados demo anteriores...");
  await wipeDemoData(demoUser.id);

  console.log("Semeando categorias...");
  const categories = await seedCategories(demoUser.id);

  console.log("Semeando contas e cartões...");
  const accounts = await seedAccounts(demoUser.id);
  const cards = await seedCards(demoUser.id);

  console.log("Semeando ~4 meses de transações...");
  const historyResult = await seedTransactionHistory(demoUser.id, accounts, cards, categories);

  console.log("Semeando transferências...");
  await seedTransfers(demoUser.id, accounts);

  console.log("Semeando parcelamentos...");
  await seedInstallments(demoUser.id, cards, categories);

  console.log("Semeando orçamentos...");
  await seedBudgets(demoUser.id, categories);

  console.log("Semeando patrimônio...");
  const assetResult = await seedAssets(demoUser.id);

  console.log("Rodando alertService.runWeekly...");
  const alertResult = await alertService.runWeekly(demoUser.id, new Date());

  console.log("\n--- Detalhes ---");
  console.log("Histórico de transações:", historyResult);
  console.log("Patrimônio:", assetResult);
  console.log("Alertas gerados nesta rodada:", alertResult);

  await printSummary(demoUser.id);
}

main()
  .catch((error) => {
    console.error("Seed demo falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
