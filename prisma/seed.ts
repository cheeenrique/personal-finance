/**
 * Seed idempotente da fase inicial do app.
 *
 * Cria os 2 usuários (dono + esposa) a partir das envs SEED_USER1_/SEED_USER2_ (ver .env),
 * `UserSettings` default e o conjunto de categorias padrão (docs/24-CATEGORIES.md)
 * pra cada um — pais primeiro, depois filhas com `parentId`.
 *
 * Rodar de novo nunca duplica: usuário via upsert por email, settings via
 * upsert por userId, categoria via find-then-create (sem unique constraint
 * dedicado — volume por usuário é baixo, ~40 categorias).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { CategoryType } from "../src/generated/prisma/enums";
// Reaproveita o client singleton (mesmo tratamento de SSL do Supabase) em vez
// de montar um adapter próprio — senão o seed ignora o fix de TLS de
// `src/lib/db/client.ts` e estoura em produção.
import { prisma } from "../src/lib/db/client";

const BCRYPT_SALT_ROUNDS = 10;

type SeedUserEnv = {
  name: string;
  email: string;
  password: string;
};

type CategorySeed = {
  name: string;
  type: CategoryType;
  children: string[];
};

// docs/24-CATEGORIES.md — pais + filhas, na ordem exata do documento.
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

// Receitas são pais próprios, sem filhas no seed inicial.
const INCOME_CATEGORIES: CategorySeed[] = [
  { name: "Salário", type: CategoryType.INCOME, children: [] },
  { name: "Freelance/Extra", type: CategoryType.INCOME, children: [] },
  { name: "Rendimentos", type: CategoryType.INCOME, children: [] },
  { name: "Reembolso", type: CategoryType.INCOME, children: [] },
  { name: "Presente/Doação", type: CategoryType.INCOME, children: [] },
  { name: "Outros (Receita)", type: CategoryType.INCOME, children: [] },
];

const CATEGORY_TREE: CategorySeed[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function readSeedUserEnv(prefix: "SEED_USER1" | "SEED_USER2"): SeedUserEnv {
  const name = process.env[`${prefix}_NAME`];
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!name || !email || !password) {
    throw new Error(`Variáveis de ambiente ${prefix}_NAME/${prefix}_EMAIL/${prefix}_PASSWORD ausentes ou vazias.`);
  }

  return { name, email, password };
}

async function upsertUser(seedUser: SeedUserEnv) {
  const passwordHash = await bcrypt.hash(seedUser.password, BCRYPT_SALT_ROUNDS);

  return prisma.user.upsert({
    where: { email: seedUser.email },
    update: { name: seedUser.name, passwordHash },
    create: { name: seedUser.name, email: seedUser.email, passwordHash },
  });
}

async function upsertUserSettings(userId: string) {
  await prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      theme: "DARK",
      alertAnomalyMultiplier: 1.5,
      alertMinimumAmount: 50.0,
      alertGreenMultiplier: 0.6,
    },
  });
}

async function findOrCreateCategory(
  userId: string,
  name: string,
  type: CategoryType,
  parentId: string | null
) {
  const existing = await prisma.category.findFirst({
    where: { userId, name, parentId },
  });
  if (existing) return existing;

  return prisma.category.create({
    data: { userId, name, type, parentId },
  });
}

async function seedCategoriesForUser(userId: string) {
  let created = 0;

  for (const parent of CATEGORY_TREE) {
    const parentBefore = await prisma.category.findFirst({
      where: { userId, name: parent.name, parentId: null },
    });
    const parentCategory = await findOrCreateCategory(userId, parent.name, parent.type, null);
    if (!parentBefore) created += 1;

    for (const childName of parent.children) {
      const childBefore = await prisma.category.findFirst({
        where: { userId, name: childName, parentId: parentCategory.id },
      });
      await findOrCreateCategory(userId, childName, parent.type, parentCategory.id);
      if (!childBefore) created += 1;
    }
  }

  return created;
}

async function seedForUser(prefix: "SEED_USER1" | "SEED_USER2") {
  const seedUserEnv = readSeedUserEnv(prefix);
  const user = await upsertUser(seedUserEnv);
  await upsertUserSettings(user.id);
  const categoriesCreated = await seedCategoriesForUser(user.id);

  return { email: user.email, categoriesCreated };
}

async function main() {
  const results = [await seedForUser("SEED_USER1"), await seedForUser("SEED_USER2")];

  for (const result of results) {
    console.log(`✔ ${result.email}: settings ok, ${result.categoriesCreated} categoria(s) nova(s) criada(s).`);
  }
}

main()
  .catch((error) => {
    console.error("Seed falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
