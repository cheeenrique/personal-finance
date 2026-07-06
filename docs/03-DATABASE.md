# 03 - DATABASE.md (ATUALIZADO)

# Database Schema

Baseado em PostgreSQL + Prisma. Decisão fechada (sem alternativa Mongo).

---

# Princípio Principal

Toda tabela contém:

```text id="u1k8qp"
userId
```

Isolamento total por usuário. Projeto para 2 usuários (dono + esposa), contas isoladas, sem household/compartilhamento.

---

# Convenções Gerais

* **IDs:** `cuid()` em todas as entidades (não sequencial, não enumerável).
* **Dinheiro:** Prisma `Decimal(12,2)` para todo valor monetário (amount, limit, totalAmount, plannedAmount, value, etc). Nunca float/Number. Parse/format só na borda (UI).
* **Datas:** armazenadas em UTC (`timestamptz`). Toda agregação (fatura, semana, mês) converte para `America/Sao_Paulo` na lógica de negócio.
* **Moeda:** BRL default (configurável em `UserSettings`).

---

# Entidades Principais

---

## User

```ts id="user01"
id
name
email
passwordHash
createdAt
updatedAt
```

---

## Transaction (CORE)

```ts id="tx01"
id
userId

description
type // INCOME | EXPENSE | TRANSFER | CARD_PAYMENT
amount // Decimal(12,2)

categoryId? // null para TRANSFER
accountId?  // conta bancária (null em compra no cartão)
cardId?     // cartão de crédito (null em transação de conta)

date // timestamptz
notes? // texto livre

isPaid // bool, default true

transferId? // agrupa as 2 pernas de uma TRANSFER

installmentPurchaseId?
installmentNumber?

createdAt
updatedAt
deletedAt? // soft delete
```

Toda Transaction referencia **exatamente uma** origem: `accountId` (conta bancária) ou `cardId` (cartão de crédito), nunca as duas nem nenhuma. TRANSFER usa `accountId` nas duas pernas.

Tags **não** ficam inline em Transaction. Associação via junction `TransactionTag` (ver abaixo).

### Transferências

`type=TRANSFER` sempre gera **2 Transactions com o mesmo `transferId`**: uma `EXPENSE` na conta origem, uma `INCOME` na conta destino. `categoryId=null` nas duas pernas. KPIs de receita/despesa excluem transferências filtrando `transferId IS NOT NULL` (as 2 pernas são EXPENSE/INCOME com transferId compartilhado), e excluem `type=CARD_PAYMENT` — é movimentação, não gasto nem ganho.

### Pagamento de Fatura (CARD_PAYMENT)

`type=CARD_PAYMENT` representa o pagamento da fatura do cartão — nunca uma despesa nova por categoria. `accountId`=conta que paga a fatura, `cardId`=cartão cuja fatura está sendo paga, `categoryId=null`. Compras no cartão já entram como `EXPENSE` no mês da compra; contar o pagamento da fatura de novo como despesa duplicaria o gasto. Efeitos: reduz o saldo da conta (`accountId`) e abate a fatura/saldo devedor do cartão (`cardId`). Excluído de "Despesas do mês" por categoria (ver `11-DASHBOARD.md`, `28-REPORTS.md`), mas incluído no cálculo de saldo da conta. Ver `22-CREDIT_CARDS.md` para o fluxo completo.

### isPaid

Despesa pendente (`isPaid=false`) não entra em "Despesas do mês" nem em "Saldo atual" — entra em bloco "Previsto/A pagar". Compra normal nasce `isPaid=true`.

---

## Account

```ts id="acc01"
id
userId

name
type
initialBalance // Decimal(12,2)

color
icon
isActive

createdAt
updatedAt
deletedAt
```

Sem coluna de saldo persistida. Saldo atual é **derivado**: `initialBalance + soma das Transactions da conta`.

---

## Card

```ts id="card01"
id
userId

name
brand
limit

closingDay
dueDay

color
icon

isActive

createdAt
updatedAt
deletedAt
```

---

## Category

```ts id="cat01"
id
userId

name
type
icon?
color?

parentId?

createdAt
updatedAt
deletedAt
```

---

## Tag

```ts id="tag01"
id
userId

name
color

createdAt
deletedAt
```

---

## TransactionTag (N:N)

```ts id="tt01"
transactionId
tagId
```

Sem `userId` próprio — exceção consciente ao Princípio Principal (topo do doc). Isolamento por usuário vem da entidade-pai (`Transaction.userId`); a junction nunca é consultada sem passar pela Transaction.

---

## Budget

```ts id="bud01"
id
userId

categoryId

month
year

plannedAmount // Decimal(12,2)

createdAt
updatedAt
deletedAt
```

Sem coluna de valor atual persistida. `currentAmount` é **derivado** (soma das Transactions da categoria no mês/ano).

---

## Asset

```ts id="asset01"
id
userId

name
type

purchaseValue // Decimal(12,2)
currentValue // Decimal(12,2)

purchaseDate

notes

createdAt
updatedAt
deletedAt
```

---

## AssetSnapshot

```ts id="assnap01"
id
assetId

value // Decimal(12,2)
date

createdAt
```

Série temporal para o gráfico de evolução do patrimônio. `Asset.currentValue` guarda o valor corrente; os snapshots alimentam o histórico.

Sem `userId` próprio — mesma exceção consciente do `TransactionTag`: isolamento por usuário vem da entidade-pai (`Asset.userId`), nunca consultado sem passar por ela.

---

## InstallmentPurchase

```ts id="ip01"
id
userId

cardId
description

totalAmount // Decimal(12,2)
installmentsCount // int

firstDueDate

createdAt
```

Sem colunas `paidInstallments`/`remainingInstallments` persistidas — derivadas contando as Transactions vinculadas via `installmentPurchaseId`. Sem tabela `Installment` separada: **cada parcela é uma Transaction** (`installmentPurchaseId` + `installmentNumber`, `amount` = valor da parcela). Fatura e limite do cartão derivam das Transactions.

---

## RecurringTransaction

```ts id="rec01"
id
userId

description
amount // Decimal(12,2)
type
categoryId
accountId

frequency // MONTHLY | WEEKLY
dayOfMonth?
dayOfWeek?

active
nextRun

createdAt
```

Gera Transactions automaticamente via cron. Baseline para detecção de gasto fora do normal (ver Alert).

---

## Alert

```ts id="alert01"
id
userId

type // WEEKLY_SUMMARY | ANOMALY | GREEN
severity // INFO | WARN | GOOD
title
message
payload // json

createdAt
readAt?
```

---

## UserSettings

```ts id="usrset01"
id
userId

currency // default BRL
timezone // default America/Sao_Paulo
theme // LIGHT | DARK | SYSTEM, default DARK (ver 04-DESIGN_SYSTEM.md)

alertAnomalyMultiplier // Decimal, default 1.5
alertMinimumAmount // Decimal(12,2), default 50.00
alertGreenMultiplier // Decimal, default 0.6

createdAt
updatedAt
```

Thresholds usados pelos algoritmos de Alert (anomalia e economia). Ver `12-SETTINGS.md`.

---

# Relações Principais

* User → tudo
* Transaction → Account / Category (nullable p/ TRANSFER)
* Transaction (parcela) → InstallmentPurchase (via `installmentPurchaseId`) → Card
* Budget → Category
* Tags → Transactions via `TransactionTag` (N:N)
* AssetSnapshot → Asset
* RecurringTransaction → gera Transactions
* Alert → User

---

# Regra de Ouro

```text id="gold01"
Transactions são a única fonte de verdade financeira.
```

Tudo o resto (saldo de conta, valor atual de budget, parcelas pagas/restantes) é **derivado via agregação sob demanda**, sem cache denormalizado. Volume de um casal é baixo; cálculo direto é KISS e correto. Denormalização fica para "depois, se doer" — não é problema agora.

---

# Performance Strategy

* índices em `userId` + `date`
* agregações para dashboard calculadas sob demanda no Postgres
* evitar joins pesados no frontend
* sem cache dedicado (sem Redis); se necessário, `unstable_cache`/`revalidate` do Next no request

---

# Backup e Migrations

## Backup

* Point-in-time recovery (PITR) do provider (Neon, Supabase ou Railway).
* `pg_dump` manual periódico como complemento:

```bash id="bkp01"
pg_dump $DATABASE_URL -F c -f backup.dump
```

* Export CSV pelo próprio usuário é feature de produto (ver `28-REPORTS.md`), não substitui backup.

## Migrations

* `prisma migrate dev` em desenvolvimento, `prisma migrate deploy` em produção.
* Migrations aditivas primeiro; destrutivas só com plano explícito.

---

# Filosofia do Banco

Simples, previsível e focado em leitura rápida.

Sem overengineering.
