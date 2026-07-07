import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Singleton do PrismaClient.
 *
 * Em dev, o Next.js recarrega módulos a cada mudança (HMR), o que recriaria
 * uma instância nova do client a cada reload e esgotaria as conexões do
 * Postgres. Guardamos a instância em `globalThis` para reaproveitá-la entre
 * reloads. Em produção cada processo cria a sua própria instância normalmente.
 *
 * O generator `prisma-client` (Prisma 7) não embute mais um query engine que
 * lê `DATABASE_URL` implicitamente — é preciso passar um driver adapter
 * explícito (`@prisma/adapter-pg`, sobre `pg`/node-postgres).
 *
 * Connection string: `DATABASE_URL` (local, via `.env`) com fallback para
 * `POSTGRES_URL_NON_POOLING`, que é o nome que a integração Supabase↔Vercel
 * injeta automaticamente em produção. Usamos a conexão DIRETA (porta 5432,
 * sem pgbouncer) de propósito, tanto aqui quanto nas migrations
 * (`prisma.config.ts`): o app tem só 2 usuários, tráfego trivial, então o
 * limite de conexões diretas do Supabase não é problema — e evitamos as
 * armadilhas de prepared statements do pgbouncer em transaction-mode (porta
 * 6543, `POSTGRES_PRISMA_URL`) com o `@prisma/adapter-pg`. Se um dia o volume
 * crescer e a conexão direta estourar limite, aí sim migrar o runtime pro
 * pooler com prepared statements desabilitados.
 */
function createPrismaClient() {
  const connectionString =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
