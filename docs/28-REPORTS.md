# 28 - REPORTS.md

# Relatórios

Este módulo consolida todas as informações financeiras do sistema em análises estruturadas.

Ele permite que o usuário entenda padrões, tendências e comportamento financeiro.

---

# Objetivo

Permitir que o usuário responda perguntas como:

* onde estou gastando mais dinheiro?
* quanto gastei em cada categoria?
* quanto gastei com cada tag?
* como meu dinheiro evoluiu ao longo do tempo?
* estou gastando mais do que ganho?
* qual cartão mais uso?
* qual conta mais movimenta dinheiro?

---

# Regra Principal

Todos os relatórios são derivados da tabela Transaction.

Nenhuma outra fonte é considerada primária.

---

# Exclusão de Transfer e Pagamento de Fatura

KPIs e relatórios de receita/despesa excluem transferências filtrando `transferId IS NOT NULL` (as 2 pernas de uma transferência são `EXPENSE`/`INCOME` com `transferId` compartilhado — nunca existe `type=TRANSFER` persistido).

Transfer é movimentação entre contas próprias, não é ganho nem gasto — sempre excluído dos totais de receita/despesa.

O **Fluxo de Caixa** (KPI "Despesas do mês" do Dashboard, Relatório de Fluxo de Caixa e a evolução mensal em `/reports`) segue o regime de caixa: `type=CARD_PAYMENT` **conta como despesa** (dinheiro saindo da conta pra pagar a fatura), junto com `EXPENSE` sem cartão (`cardId IS NULL`). Compra no cartão (`EXPENSE` com `cardId` não-nulo) fica de fora do caixa — só vira despesa quando a fatura é paga (`CARD_PAYMENT`) — então não há double-count. Filtra `type IN (INCOME, EXPENSE, CARD_PAYMENT)`, `transferId IS NULL` e `cardId IS NULL`. Ver `03-DATABASE.md` e `22-CREDIT_CARDS.md`.

O **Relatório por Categoria** é accrual (regime de competência), não de caixa: soma o gasto no momento da compra, incluindo compra no cartão (`cardId` não-nulo). `CARD_PAYMENT` não tem categoria (`22-CREDIT_CARDS.md`), então nunca aparece aqui — contar o pagamento de fatura por categoria duplicaria o gasto já lançado na compra. Filtra `type IN (INCOME, EXPENSE)` e `transferId IS NULL`.

Relatório por Conta continua considerando Transfer e CARD_PAYMENT, pois ali o que importa é a movimentação da conta, não o ganho/gasto por categoria.

---

# Tipos de Relatórios

---

## 1. Relatório de Categorias

```text id="c1k8qp"
Mostra gastos agrupados por categoria
```

Exemplo:

* Alimentação → R$ 2.000
* Casa → R$ 1.200
* Carro → R$ 800

---

## 2. Relatório de Tags

```text id="t4v2qn"
Mostra gastos por contexto livre
```

Exemplo:

* Filho → R$ 1.500
* Viagem → R$ 3.000
* MacBook → R$ 5.944

---

## 3. Relatório de Fluxo de Caixa

```text id="f7m2qp"
Entradas vs Saídas ao longo do tempo
```

Mostra:

* receitas
* despesas
* saldo líquido

---

## 4. Relatório por Conta

```text id="a3v8qn"
Movimentação por conta bancária
```

Exemplo:

* Nubank → R$ 5.000 movimentados
* Itaú → R$ 2.000 movimentados

---

## 5. Relatório por Cartão

```text id="c9m3qp"
Gastos por cartão de crédito
```

Exemplo:

* Nubank → R$ 4.500
* XP → R$ 1.200

---

## 6. Relatório de Parcelamentos

```text id="p7k2qp"
Mostra impacto futuro de dívidas parceladas
```

Exemplo:

* MacBook → 6 meses restantes
* iPhone → 3 meses restantes

---

## 7. Relatório de Orçamento

```text id="b2v8qp"
Comparação planejado vs realizado
```

Exemplo:

* Alimentação: R$ 1500 → R$ 1200 (OK)
* Lazer: R$ 500 → R$ 800 (ESTOURO)

---

## 8. Relatório de Patrimônio

```text id="s4m2qp"
Evolução dos Assets ao longo do tempo
```

Mostra crescimento patrimonial.

Alimentado pela série temporal de `AssetSnapshot` (valor + data), não por recálculo do Asset atual. Cada snapshot é um ponto no gráfico de evolução.

---

# Filtros Globais

Todos os relatórios suportam:

```text id="f6k2qp"
Período (dia, mês, ano, custom)

Categoria

Tags

Conta

Cartão

Tipo de transação
```

---

# Visualização

Relatórios podem ser exibidos como:

* tabelas
* gráficos de barra
* gráficos de linha
* gráficos de pizza

---

# Valores Monetários

Todo valor exibido em relatório (total, média, saldo) usa `Decimal` (Prisma), nunca float. Soma/agregação acontece no backend, formatação em BRL só na borda (UI).

---

# Regras de Performance

* usar agregações no backend
* evitar recalcular tudo no frontend
* cache de queries frequentes
* pré-agrupamento por período

---

# Dashboard vs Reports

## Dashboard

* visão rápida
* resumo
* foco em decisão imediata

## Reports

* análise profunda
* exploração
* comparação histórica

---

# Regra Principal de UX

Relatórios não devem ser complexos de usar.

O usuário deve:

* selecionar filtro
* ver resultado
* entender em segundos

---

# Insights Automáticos (sem IA)

O sistema pode gerar insights simples como:

```text id="i2v8qp"
Você gastou 30% a mais em Alimentação este mês
```

Resumo semanal, alerta de anomalia (gasto fora do normal) e alerta verde (economia) são especificados em detalhe no **29-ALERTS.md** — algoritmos, thresholds e entidade `Alert` ficam lá. Este documento cobre só o insight simples embutido no relatório.

---

# Exportação

Relatórios podem ser exportados para:

* CSV
* PDF (futuro)

---

# Estados

## Loading

Skeleton de gráficos e tabelas

---

## Empty

```text id="e3k7qp"
Nenhum dado disponível para este período.
```

---

# Integração com Sistema

Relatórios utilizam:

* Transactions (principal)
* Categories
* Tags
* Accounts
* Cards
* Budgets
* Assets

---

# Regra de Ouro

Se um dado não estiver na Transaction, ele não existe para relatório.

---

# Filosofia

Relatórios são a camada de entendimento do sistema.

Eles transformam dados em decisões.

Sem eles, o sistema é apenas um registro financeiro.

Com eles, vira um painel de controle da vida financeira.
