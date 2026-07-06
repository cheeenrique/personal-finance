# 22 - CREDIT_CARDS.md

# Cartões de Crédito

Este módulo gerencia todos os cartões de crédito do usuário.

Ele é responsável por controle de limite, gastos e faturas.

---

# Objetivo

Permitir que o usuário entenda rapidamente:

* quanto já gastou no cartão
* quanto ainda tem de limite disponível
* quanto será cobrado na próxima fatura
* quais compras estão parceladas
* qual cartão está mais comprometido

---

# Regra Principal

Cartão de crédito não é saldo.

Cartão de crédito é **compromisso futuro de pagamento**.

---

# Estrutura do Cartão

```text
id

userId

name

brand

limit (Decimal 12,2)

closingDay

dueDay

color

icon

isActive

createdAt

updatedAt

deletedAt
```

`closingDay`/`dueDay` são dias do mês (1-31). Todo cálculo de ciclo/fatura usa esses dias interpretados em **America/Sao_Paulo** (timezone fixo do app) — nunca UTC puro, para não deslocar a virada de fatura em ±1 dia perto da meia-noite.

---

# Lógica de Fatura (sem tabela Statement)

Faturas são calculadas dinamicamente com base em:

* date (da Transaction)
* closingDay
* dueDay

Todas as comparações de data (limite do ciclo, "está no ciclo atual?", mês da fatura) usam **America/Sao_Paulo**. `date` é armazenado em UTC (`timestamptz`) e convertido para America/Sao_Paulo antes de qualquer agregação de fatura.

---

# Como funciona a fatura

Uma fatura contém todas as transações do cartão dentro do ciclo:

```text
Data da compra >= fechamento anterior
e
Data da compra < fechamento atual
```

---

# Visão de Cartão

Cada cartão deve exibir:

```text
Nome

Limite total

Limite usado

Limite disponível

Valor estimado da próxima fatura

Barra de progresso
```

---

# Exemplo de Card UI

```text
Nubank

████████░░ 78%

R$ 3.200 / R$ 4.000

Disponível: R$ 800
```

---

# Transações no Cartão

Toda transação com cardId:

* entra no cálculo do limite usado
* entra na fatura do ciclo correspondente
* pode ser parcelada

---

# Status de Pagamento no Cartão (isPaid)

Ponto que gera ambiguidade se não for explícito — regra fechada:

## Compra no cartão

* Transaction: `type=EXPENSE`, `cardId` preenchido, `accountId=null`, `categoryId=<categoria da compra>`, `isPaid=true`.
* `isPaid=true` desde a criação: a compra já é um gasto **confirmado** no momento em que acontece — ela conta em "Despesas do mês" da categoria (mês da compra, não o mês do vencimento da fatura) e no limite usado do cartão imediatamente.
* Uma compra no cartão **nunca fica com `isPaid=false`** no fluxo normal — isso é reservado a despesas em conta (ex.: boleto ainda não pago).

## Pagamento da fatura

* Ato de pagar a fatura é **outra Transaction**, com tipo próprio: `type=CARD_PAYMENT`, `accountId=<conta bancária usada para pagar>`, `cardId=<cartão cuja fatura está sendo paga>`, `categoryId=null`, `amount=valor da fatura`.
* `categoryId=null` porque o gasto por categoria já foi contabilizado no momento de cada compra — contar de novo aqui duplicaria a despesa. Segue o mesmo raciocínio de exclusão usado em TRANSFER.
* `type=CARD_PAYMENT` (não `EXPENSE`) é o que evita a dupla contagem: fica explícito no schema que essa Transaction é a liquidação de gastos já lançados, não um gasto novo. Ver `03-DATABASE.md`.
* Essa Transaction **não entra em "Despesas do mês" por categoria** (`11-DASHBOARD.md`, `28-REPORTS.md`), mas debita normalmente o saldo da conta bancária (`accountId`) e abate a fatura/saldo devedor do cartão (`cardId`).
* `isPaid` dessa transação segue o padrão comum: `true` quando o pagamento já ocorreu, `false` se foi só agendado/lançado como previsão (entra em "Previsto / A pagar" até ser confirmado).

## Resumo

```text id="cp1x8mz"
Compra no cartão    → type=EXPENSE, isPaid=true, categorizada, conta no mês da compra
Pagamento da fatura → type=CARD_PAYMENT, accountId+cardId, sem categoria, não conta como despesa nova
```

---

# Parcelamentos no Cartão

Não existe tabela `Installment` separada. Cada parcela **é uma Transaction** (`installmentPurchaseId` + `installmentNumber`), vinculada ao cartão via `cardId`. Detalhes completos do modelo em 23-INSTALLMENTS.

Cada parcela (Transaction):

* entra em uma fatura diferente, pela sua própria `date`
* respeita o mês de vencimento
* não duplica valor total no limite — o limite usado é a soma das parcelas já geradas, não o `totalAmount` da compra repetido em cada mês

---

# Regra de Parcelamento

O valor total da compra:

* impacta limite apenas uma vez
* parcelas entram nas faturas futuras

---

# Exemplo

Compra de R$ 1.000 em 10x:

```text
Limite usado: R$ 1.000 (uma vez)

Faturas:
R$ 100 por mês por 10 meses
```

---

# Criação de Cartão

## Fluxo

```text
Nome

Bandeira

Limite

Dia de fechamento

Dia de vencimento

Cor

Salvar
```

---

# Interface

## Cards na listagem

Cada cartão mostra:

* limite
* usado
* disponível
* fatura atual
* progresso visual

---

# Detalhe do Cartão

Ao clicar:

Mostrar:

* resumo da fatura atual
* histórico de faturas
* transações
* parcelamentos ativos
* gráfico de gastos

---

# Fatura Atual

Calculada automaticamente.

Inclui:

* compras dentro do ciclo atual
* parcelas do ciclo atual

---

# Limite

```text
Limite disponível = limite total - fatura atual
```

---

# Faturas Futuras

Baseadas em parcelas já existentes.

---

# Regras de Negócio

## Regra 1

Cartão nunca pode ter saldo positivo.

---

## Regra 2

Limite usado é sempre baseado em:

* compras
* parcelas futuras

---

## Regra 3

Transferências não entram no cartão.

---

## Regra 4

Cada transação com cartão deve ter:

* cardId
* date

---

# Integração com Transações

Cartões dependem diretamente de Transactions.

Toda compra no cartão é uma Transaction.

---

# Integração com Dashboard

O Dashboard exibe:

* total de dívida
* fatura atual
* limite disponível global
* risco de endividamento

---

# Estados

## Loading

Skeleton de cartões

---

## Empty

```text
Nenhum cartão cadastrado.

[ Criar primeiro cartão ]
```

---

# UX Importante

O usuário nunca deve pensar:

> "quantas parcelas tenho no cartão?"

Ele deve ver:

* "quanto está comprometido"
* "quanto ainda posso gastar"

---

# Performance

* cálculos de fatura devem ser server-side
* evitar recomputar tudo no frontend
* usar agregações por período

---

# Filosofia

Cartão de crédito não é apenas um meio de pagamento.

Ele é um indicador de comportamento financeiro.

O objetivo não é apenas mostrar gastos.

É mostrar **impacto futuro do consumo atual**.
