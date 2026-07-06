# 01 - STACK.md (ATUALIZADO)

# Stack Técnica

---

# Frontend

* Next.js (App Router)
* TypeScript
* Tailwind CSS
* shadcn/ui (opcional, recomendado)
* React Server Components

---

# Backend

* **Server Actions** — padrão para TODAS as mutations do app web.
* **Route Handler (`/api/...`)** — apenas para webhook do Telegram (`/api/telegram`) e crons (`/api/cron/*`).
* Domain modules separados

---

# Banco de Dados

* PostgreSQL + Prisma ORM. Decisão fechada (sem alternativa Mongo).
* IDs: `cuid()` em todas as entidades.
* Dinheiro: Prisma `Decimal(12,2)`. Nunca float/Number.
* Timezone: `America/Sao_Paulo` fixo em todo cálculo de data. Timestamps armazenados em UTC (`timestamptz`).
* Moeda: BRL default.

Ver `03-DATABASE.md` para o schema completo.

---

# Auth

* Auth.js (NextAuth)
* Credentials Provider (email/senha) — único método. Sem OAuth, sem cadastro público.
* 2 usuários provisionados via seed/allowlist (ver `10-AUTH.md`)

---

# Infraestrutura

Duas opções viáveis; escolha feita no deploy.

## Vercel

* app + Vercel Cron (chama `/api/cron/weekly-summary` protegido por secret)
* Neon / Supabase (Postgres)

## Railway (recomendado)

* app + Postgres nativo + cron nativo + webhook long-running
* Recomendado pela simplicidade (tudo junto no mesmo provider)

Sem Redis. Sem camada de cache dedicada — cálculos direto no Postgres; se necessário, `unstable_cache`/`revalidate` do Next no request.

---

# Arquitetura

```text id="a8k3qp"
UI (App Router)
↓
Server Actions (mutations) / Route Handlers (telegram, cron)
↓
Modules (domain logic)
↓
Prisma ORM
↓
PostgreSQL
```

---

# Estrutura de Código

* modules/ → lógica de domínio
* app/ → rotas
* components/ → UI
* lib/ → utilitários
* prisma/ → schema

---

# Regras Técnicas

* tudo isolado por userId
* lógica sempre no backend
* UI nunca contém regra de negócio
* queries otimizadas para agregação

---

# Performance

* server-side aggregation
* sem cache dedicado (sem Redis); `unstable_cache`/`revalidate` do Next quando fizer sentido
* paginação apenas na listagem de Transactions (as demais listagens são pequenas — sem paginação server-side)
* evitar fetch redundante

---

# Backup e Migrations

* Backup: PITR do provider (Neon/Supabase/Railway) + `pg_dump` manual periódico.
* Migrations: `prisma migrate`.

Ver `03-DATABASE.md` para detalhes.

---

# Escalabilidade

Projeto para **2 usuários isolados por userId** (dono + esposa), sem household/compartilhamento, sem discurso de SaaS/multiusuário. Arquitetura preparada para:

* expansão de módulos
* integrações externas (Telegram, etc)
