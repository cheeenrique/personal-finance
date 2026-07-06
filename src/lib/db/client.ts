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
 */
function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
