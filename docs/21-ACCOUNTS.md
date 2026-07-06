# 21 - ACCOUNTS.md

# Contas

Este módulo representa todas as contas financeiras do usuário.

São elas que determinam o saldo disponível real da aplicação.

---

# Objetivo

Permitir que o usuário controle:

* saldo disponível
* movimentações por conta
* origem e destino de dinheiro
* visão consolidada do patrimônio líquido líquido (cash-based)

---

# Tipos de Conta

```text id="a1k8pq"
CHECKING   → Conta corrente
SAVINGS    → Poupança
CASH       → Dinheiro físico
BUSINESS   → Conta PJ
OTHER      → Outros
```

---

# Estrutura da Conta

```text id="c4m7xz"
id

userId

name

type

initialBalance (Decimal 12,2)

color

icon

isActive

createdAt

updatedAt

deletedAt
```

**Sem `currentBalance` persistido.** O saldo atual é sempre **derivado** das Transactions — ver seção "Saldo da Conta" abaixo.

---

# Regra Principal

Toda transação pode impactar uma conta.

* INCOME → soma no saldo
* EXPENSE → subtrai do saldo
* TRANSFER → movimenta entre contas

---

# Saldo da Conta

O saldo é sempre **calculado sob demanda**, direto das Transactions:

```text id="sb1x9mp"
saldo = initialBalance
      + SUM(INCOME.amount  WHERE accountId = conta AND isPaid = true)
      - SUM(EXPENSE.amount WHERE accountId = conta AND isPaid = true)
```

TRANSFER entra nessa soma normalmente (a perna EXPENSE debita a origem, a perna INCOME credita o destino) — só não entra nos KPIs de receita/despesa.

---

# Estratégia

Sem coluna `currentBalance` persistida/cacheada. Volume de dados de um casal (2 usuários) é baixo — calcular direto no Postgres é KISS, sempre consistente e evita bug de cache dessincronizado.

Denormalização (ex.: reintroduzir `currentBalance` como cache atualizado por trigger/job) fica para **depois, apenas se o cálculo sob demanda doer de verdade** em performance. Não implementar preventivamente.

---

# Criação de Conta

## Fluxo

```text id="f2v9qn"
Usuário abre modal

↓

Nome da conta

↓

Tipo

↓

Saldo inicial

↓

Salvar
```

---

# Interface

## Modal (Desktop)

## Drawer (Mobile)

Campos:

```text id="m8x3kp"
Nome

Tipo

Saldo inicial

Cor

Ícone
```

---

# Listagem de Contas

Exibir cards.

Cada card contém:

```text id="l4q7mz"
Nome

Tipo

Saldo atual

Saldo inicial

Indicador visual
```

---

# Exemplo de Card

```text id="v7n2xp"
Conta Corrente

R$ 5.200

────────────

+R$ 800 este mês
```

---

# Detalhe da Conta

Ao clicar em uma conta:

Mostrar:

* saldo atual
* histórico de transações
* filtros por categoria
* gráficos simples

---

# Filtros

Dentro da conta:

```text id="f6k3zn"
Período

Categoria

Tipo

Tags

Valor
```

---

# Transferência entre contas

Uma transferência gera:

```text id="t9m4pq"
1 TRANSACTION (saída, type=EXPENSE, accountId=origem)
1 TRANSACTION (entrada, type=INCOME, accountId=destino)
```

As duas compartilham o mesmo `transferId`. Sempre vinculadas — editar/excluir uma reflete na outra.

---

# Regras de Transferência

* `categoryId = null` nas duas pernas
* não entra em relatórios de gasto (receita/despesa)
* não entra em KPIs de receita/despesa
* apenas movimenta saldo entre as contas envolvidas

---

# Integração com Dashboard

Contas alimentam:

* saldo total
* patrimônio líquido
* fluxo de caixa

---

# Saldo Total

Soma de todas as contas ativas, incluindo `OTHER` (toda conta guarda dinheiro real):

```text id="s3x8mq"
CHECKING + SAVINGS + CASH + BUSINESS + OTHER
```

---

# Estados

## Loading

Skeleton de cards

---

## Empty

```text id="e7v1qp"
Nenhuma conta cadastrada.

[ Criar primeira conta ]
```

---

# Exclusão

Conta só pode ser excluída se:

* não tiver saldo negativo inconsistente
* não houver transações associadas OU forem movidas

Preferência: soft delete

---

# Regras de Negócio

## Conta obrigatória em transações

Exceto:

* transferências internas podem envolver duas contas

---

## Saldo nunca negativo inconsistente

Sistema deve impedir inconsistência de saldo salvo exceções controladas

---

# Performance

* saldo é calculado sob demanda, via agregação (`SUM`) no Postgres
* usar índice em `accountId` + `date` para a agregação ficar rápida
* sem cache dedicado (sem Redis) — se o volume crescer a ponto de doer, avaliar denormalização pontual depois

---

# UX de Conta

O usuário deve conseguir responder:

* quanto tenho nesta conta?
* quanto entrou este mês?
* quanto saiu?
* qual conta mais uso?

Em poucos segundos.

---

# Filosofia

Contas representam dinheiro real disponível.

Se o saldo estiver errado ou confuso:

* todo o sistema perde confiança

Por isso consistência é prioridade máxima.
