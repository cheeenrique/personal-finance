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
/**
 * Supabase exige TLS mas apresenta um cert fora do trust store padrão do `pg`.
 * No `pg` 8.22, `sslmode=require` na connection string valida a cadeia inteira
 * (e estoura `self-signed certificate in certificate chain`) — e um objeto
 * `ssl` passado junto é IGNORADO quando `sslmode` está na string. A forma que
 * funciona: REMOVER `sslmode` da string e passar `ssl: { rejectUnauthorized:
 * false }` como objeto — TLS criptografado, sem validar a cadeia (padrão
 * pragmático pra Supabase + node-postgres). Local (Docker, sem `sslmode` e sem
 * host supabase) conecta sem SSL.
 */
function createPrismaClient() {
  // Runtime prefere o TRANSACTION pooler do Supabase (`POSTGRES_PRISMA_URL`,
  // porta 6543) — feito pra serverless: libera a sessão do banco a cada
  // transação, então função fria da Vercel não segura conexão. O session-mode
  // (porta 5432, `POSTGRES_URL_NON_POOLING`) trava em 15 sessões idle presas ->
  // `EMAXCONNSESSION`. Local: `DATABASE_URL` (Docker) vence. Migrations seguem
  // na conexão direta (`prisma.config.ts`), não no transaction pooler.
  const raw =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL_NON_POOLING;
  const needsSsl = /[?&]sslmode=/.test(raw ?? "") || (raw ?? "").includes("supabase");

  if (!needsSsl) {
    return new PrismaClient({ adapter: new PrismaPg({ connectionString: raw }) });
  }

  // Tira `sslmode` (cert do Supabase estoura o `pg` 8.22 — ver acima) e
  // `pgbouncer=true` (flag do query-engine do Prisma, sem sentido pro driver pg).
  const connectionString = (raw ?? "")
    .replace(/([?&])(sslmode|pgbouncer)=[^&]*/gi, "$1")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");

  // `idleTimeoutMillis`/`allowExitOnIdle`: fecha conexão ociosa rápido pra não
  // acumular sessão no pooler. `max` modesto — 2 usuários, tráfego trivial.
  const adapter = new PrismaPg({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
