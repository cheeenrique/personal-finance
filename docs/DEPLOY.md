# Deploy — Vercel + Supabase

Nota curta de deploy. Stack e arquitetura completas em `01-STACK.md`.

---

# Conexão com o banco em produção

A integração oficial Supabase↔Vercel injeta env vars com nomes próprios
(`POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING`, `POSTGRES_URL`,
`POSTGRES_HOST`, etc.) — não `DATABASE_URL`, que é o que o app lê por padrão
(`src/lib/db/client.ts`, `prisma.config.ts`).

Para não quebrar o dev local (que usa `DATABASE_URL` do `.env`), o app faz
fallback: se `DATABASE_URL` não existir, usa `POSTGRES_URL_NON_POOLING` —
tanto no runtime (`src/lib/db/client.ts`) quanto nas migrations
(`prisma.config.ts`, campo `datasource.url`).

**Por que conexão direta (porta 5432) e não o pooler (`POSTGRES_PRISMA_URL`,
pgbouncer, porta 6543):** app de 2 usuários, tráfego trivial — limite de
conexões diretas do Supabase não é problema nesse volume. Em compensação,
evitamos as armadilhas de prepared statements do pgbouncer em
transaction-mode com o `@prisma/adapter-pg`. Se um dia o volume crescer e a
conexão direta estourar limite de conexões, migrar o runtime pro pooler com
prepared statements desabilitados.

Nota técnica: o Prisma 7.8 (`@prisma/config`) não tem mais um campo
`directUrl` separado em `prisma.config.ts` — só `url`/`shadowDatabaseUrl`.
Como usamos a mesma conexão direta pra tudo, isso não faz falta.

---

# Checklist pós-deploy (manual, banco Supabase começa vazio)

1. Rodar as migrations contra o Supabase: `prisma migrate deploy`.
2. Rodar o seed dos 2 usuários: `prisma db seed` (ou `tsx prisma/seed.ts`).
3. Conferir que a Vercel (Production) tem, além das envs do banco, todas as
   demais envs que o app exige (ver `10-AUTH.md` para a lista completa):
   - `AUTH_SECRET`
   - `AUTH_URL`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `TELEGRAM_ALLOWED_CHAT_IDS` (fallback, opcional)
   - `CRON_SECRET`
   - `SEED_USER1_EMAIL`, `SEED_USER1_PASSWORD`, `SEED_USER1_NAME`
   - `SEED_USER2_EMAIL`, `SEED_USER2_PASSWORD`, `SEED_USER2_NAME`

Nenhuma dessas é injetada pela integração Supabase — só as do banco
(`POSTGRES_*`) são. Precisam ser configuradas manualmente em
Vercel → Project → Settings → Environment Variables (Production).
