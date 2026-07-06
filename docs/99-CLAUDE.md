# 99 - CLAUDE.md

# Estrutura do Projeto

Este documento define a estrutura inicial do projeto Next.js.

---

# Stack Base

* Next.js (App Router)
* TypeScript
* Tailwind CSS
* Auth.js (Credentials only, sem OAuth)
* Prisma
* PostgreSQL (Neon, Supabase ou Railway)

---

# Decisão Importante

Banco: **PostgreSQL + Prisma**. Decisão fechada, sem alternativa Mongo.

Motivo:

* melhor para relações (transactions, cards, installments)
* queries mais fortes para relatórios
* menos dor em aggregations financeiras

---

# Estrutura de Pastas

```text id="p1k8qp"
src/

  app/
    (auth)/
      login/

    (app)/
      dashboard/
      transactions/
      accounts/
      cards/
      categories/
      tags/
      budgets/
      assets/
      settings/

    api/
      telegram/
      cron/

  components/
    ui/
    layout/
    dashboard/
    forms/
    tables/

  modules/
    auth/
    transactions/
    accounts/
    cards/
    categories/
    tags/
    budgets/
    assets/
    reports/
    telegram/

  lib/
    db/
    auth/
    utils/
    date/
    money/

  styles/

  types/
```

---

# Regra de Organização

## app/

Responsável por rotas

---

## modules/

Responsável por lógica de domínio

---

## components/

Responsável por UI reutilizável

---

## lib/

Funções puras e infraestrutura

---

# Convenção de Código

## 1. Domain-first

Toda lógica pertence ao módulo, não à UI.

---

## 2. UI é descartável

Componentes não devem conter regra de negócio.

---

## 3. Server Actions como padrão

Server Action apenas delega para modules. Route Handler (`/api/...`) só existe para o webhook do Telegram e os crons.

---

# Fluxo de Dados

```text id="f2v8qp"
UI
 ↓
Server Action (padrão) / Route Handler (telegram, cron)
 ↓
Module (domain logic)
 ↓
Database
```

---

# Exemplo (Transaction)

```text id="t4k7qp"
createTransaction() (Server Action) → chama module/transactions
```

---

# Design System (base)

* Tailwind
* shadcn/ui (opcional)
* componentes simples e consistentes

---

# Regras de Backend

* sempre filtrar por userId
* nunca expor dados cruzados
* validação obrigatória no backend

---

# Database Layer

## Prisma schema base:

* User
* Transaction
* Account
* Card
* Category
* Tag
* TransactionTag
* Budget
* Asset
* AssetSnapshot
* InstallmentPurchase
* RecurringTransaction
* Alert
* UserSettings

Sem tabela `Installment` separada — parcela é Transaction (`installmentPurchaseId` + `installmentNumber`). Ver `03-DATABASE.md`.

---

# Estratégia de Deploy

* Vercel (app + Vercel Cron) + Neon/Supabase (Postgres), OU
* Railway (app + Postgres nativo + cron nativo) — recomendado pela simplicidade
* Sem Redis, sem camada de cache dedicada

---

# Performance

* dashboard com aggregation queries direto no Postgres
* sem cache dedicado (sem Redis); `unstable_cache`/`revalidate` do Next quando necessário
* evitar client-heavy logic

---

# Regra de Ouro

Se não estiver no module/, não existe regra de negócio.

---

# Filosofia

Estrutura simples, mas escalável.

Nada de arquitetura excessiva.

O sistema cresce por módulos, não por complexidade.
