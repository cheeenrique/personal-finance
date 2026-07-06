# 20 - TRANSACTIONS.md

# Transações

Este módulo é responsável por todas as movimentações financeiras da aplicação.

Toda entrada ou saída de dinheiro passa por aqui.

---

# Objetivo

Permitir que o usuário registre e consulte suas movimentações financeiras de forma:

* rápida
* simples
* filtrável
* consistente

O lançamento de uma transação deve levar menos de 10 segundos.

---

# Tipos de Transação

```text id="t1k9qz"
INCOME      → Receita
EXPENSE     → Despesa
TRANSFER    → Transferência
```

---

# Regra Principal

Toda movimentação financeira é uma Transaction.

Não existem tabelas separadas para:

* receitas
* despesas

---

# Estrutura da Transação

Campos oficiais (fonte única — deve bater com o schema em 03-DATABASE):

```text id="x7m3qp"
id

userId

description

type

amount (Decimal 12,2 — nunca float/Number)

date (timestamptz, armazenado em UTC, calculado/exibido em America/Sao_Paulo)

accountId

cardId (nullable — só em compras no cartão)

categoryId (nullable — null em TRANSFER)

notes

isPaid (bool, default true)

transferId (nullable — só em TRANSFER, agrupa as 2 pernas)

installmentPurchaseId (nullable — só em parcela)

installmentNumber (nullable — só em parcela)

createdAt

updatedAt

deletedAt
```

Tags **não** são um campo inline (`tags[]`). São modeladas via tabela de junção `TransactionTag(transactionId, tagId)` — ver seção Tags abaixo e 25-TAGS.

---

# Criação de Transação

## Fluxo

```text id="c3v8mn"
Usuário abre modal

↓

Preenche dados básicos

↓

Seleciona tipo (receita/despesa)

↓

Seleciona categoria

↓

Seleciona conta ou cartão

↓

Salva

↓

Transação aparece instantaneamente no sistema
```

---

## Campos mínimos obrigatórios

* descrição
* valor
* tipo
* categoria
* data

Tudo o resto é opcional.

---

# Interface de Criação

## Modal (Desktop)

## Drawer (Mobile)

Campos organizados em ordem de velocidade:

```text id="f9k2lm"
Descrição

Valor

Tipo

Categoria

Conta / Cartão

Data

Tags (opcional)

Observações (opcional)
```

---

# Edição de Transação

Pode ser feita via:

* modal
* drawer
* tabela inline (rápida)

Nunca abrir página separada.

---

# Exclusão

Sempre pedir confirmação.

Permitir undo futuro (soft delete).

---

# Filtros

A tabela de transações deve suportar:

```text id="f4p8zx"
Período

Tipo

Categoria

Conta

Cartão

Tags

Valor (range)

Descrição (search)
```

---

# Listagem

## Colunas padrão

* Data
* Descrição
* Categoria
* Conta / Cartão
* Tipo
* Valor

---

## Ordenação padrão

* mais recentes primeiro

---

# Tags

Uma transação pode ter múltiplas tags, via tabela de junção `TransactionTag(transactionId, tagId)`.

Não existe array `tags[]` inline no schema de Transaction — cada tag associada é uma linha na tabela de junção.

Exemplo:

```text id="t7x4lm"
Filho
Viagem
MacBook
```

---

# Cartão

Se `cardId` existir:

* transação entra em fatura automaticamente
* associada ao cartão

---

# Conta

Se `accountId` existir:

* impacto direto no saldo

---

# Transferência

Transferência sempre envolve:

* conta origem
* conta destino

Nunca utilizar categoria para transferências.

## Modelo

Uma TRANSFER gera **2 Transactions com o mesmo `transferId`**:

```text id="tr1x8mp"
Transaction 1: type=EXPENSE, accountId=<origem>, categoryId=null, transferId=X
Transaction 2: type=INCOME,  accountId=<destino>, categoryId=null, transferId=X
```

`categoryId` sempre `null` nas duas pernas.

Editar ou excluir uma perna deve propagar para a outra (as 2 formam uma unidade lógica).

Transfers são **excluídas de receita e despesa nos KPIs** (Dashboard, Relatórios) — é movimentação entre contas, não ganho nem gasto. Ver 21-ACCOUNTS, 28-REPORTS, 11-DASHBOARD.

---

# Parcelamentos

Transações podem ser geradas a partir de um parcelamento.

Cada parcela é uma Transaction.

Mas sempre vinculada a:

```text id="p2v6kc"
installmentPurchaseId

installmentNumber
```

Detalhes completos do modelo em 23-INSTALLMENTS.

---

# Regra de Parcelas

Nunca exibir parcelamento como transações separadas na UI principal.

Elas são agrupadas visualmente.

---

# Status de Pagamento

```text id="s8m1qp"
isPaid = true  → pago

isPaid = false → pendente
```

Toda transação nasce `isPaid = true` por padrão. `isPaid = false` é usado para despesas/receitas já lançadas mas ainda não liquidadas (ex.: boleto agendado, conta a receber).

## Semântica nos KPIs

* Despesa com `isPaid = false` **não entra** em "Despesas do mês" nem em "Saldo atual" — entra num bloco separado **"Previsto / A pagar"**.
* Assim que marcada como paga (`isPaid = true`), passa a contar normalmente no mês da sua `date`.
* Compras no cartão de crédito seguem regra própria — ver "Status de Pagamento no Cartão" em 22-CREDIT_CARDS.
* TRANSFER nunca entra nesse cálculo (é excluída de receita/despesa independente de `isPaid`).

---

# Recorrência (RecurringTransaction)

Contas fixas (aluguel, luz, água, salário, assinaturas) não precisam ser lançadas manualmente todo mês.

```text id="rc1x9mp"
RecurringTransaction

id
userId
description
amount (Decimal)
type
categoryId
accountId
frequency (MONTHLY | WEEKLY)
dayOfMonth (nullable)
dayOfWeek (nullable)
active
nextRun
createdAt
```

## Funcionamento

* É um template. Um cron gera Transactions reais a partir dele (respeitando `frequency` e `nextRun`, calculado em America/Sao_Paulo).
* Cada Transaction gerada é independente — editar uma não altera o template, e vice-versa.
* Usuário pode desativar (`active = false`) sem apagar o histórico já gerado.

## Uso para detecção de anomalia

RecurringTransaction é a **baseline natural** para os alertas de gasto fora do normal (ver 29-ALERTS): despesas recorrentes conhecidas (luz, água, assinaturas) formam o piso esperado de gasto mensal, contra o qual desvios são comparados.

---

# UX de Lançamento Rápido

O sistema deve permitir:

```text id="q1x9zn"
"mercado 120"
```

↓

Interpretar automaticamente:

* EXPENSE
* categoria: Alimentação
* valor: 120

````

(esta regra será implementada no Telegram e futuramente na busca global)

---

# Tela de Lista

## Estrutura

```text id="l3k8vq"
Filtro superior

↓

Tabela de transações

↓

Paginação
````

---

# Estados

## Loading

Skeleton da tabela

---

## Empty

```text id="e7m2px"
Nenhuma transação encontrada.

[ Criar transação ]
```

---

## Erro

Mensagem simples:

```text id="r4x9lm"
Não foi possível carregar transações.
```

---

# Performance

A tabela deve suportar:

* paginação server-side
* filtros otimizados
* índices adequados (accountId, cardId, date, categoryId)

Nunca carregar todas as transações de uma vez. Sem Redis/cache dedicado — Postgres direto, `unstable_cache` do Next se necessário (ver 01-STACK).

---

# Ações Rápidas

Cada linha deve permitir:

* editar
* excluir
* duplicar

---

# Integração com Dashboard

Transações alimentam:

* KPIs
* gráficos
* cartões
* orçamento
* patrimônio

Nunca duplicar lógica.

---

# Regras de Negócio

## Categoria obrigatória

Toda transação deve ter categoria.

---

## Data obrigatória

Toda transação deve ter data.

---

## Valor positivo

Valor sempre positivo.

O tipo define se é entrada ou saída.

---

# Soft Delete

Transações nunca são removidas fisicamente.

Usar deletedAt.

---

# Filosofia

A transação é o centro do sistema.

Se este módulo estiver rápido e simples:

* o sistema inteiro funciona bem

Se estiver lento ou complexo:

* o sistema inteiro falha
