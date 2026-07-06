# 26 - BUDGETS.md

# Orçamentos (Budgets)

O módulo de orçamentos permite que o usuário defina limites de gastos por categoria dentro de um período.

---

# Objetivo

Permitir que o usuário:

* defina quanto pode gastar por mês
* acompanhe gastos em tempo real
* receba alerta de estouro de orçamento
* compare planejado vs realizado
* entenda padrões de consumo

---

# Regra Principal

Orçamentos são sempre por:

* categoria
* mês
* ano

---

# Estrutura do Budget

```text id="b1k8qp"
id (cuid)

userId

categoryId

month

year

plannedAmount (Decimal 12,2)

createdAt

updatedAt

deletedAt
```

Não existe coluna `currentAmount` persistida. O gasto do orçamento é sempre **derivado** das Transactions no momento da consulta (ver "Atual" abaixo) — segue a mesma regra de ouro de `Account.currentBalance` e `InstallmentPurchase.paidInstallments`: nada de cache denormalizado, volume de dados de um casal não justifica.

---

# Lógica de Funcionamento

## Planejado

Valor definido pelo usuário:

```text id="p4v2qn"
Ex: Alimentação → R$ 1500
```

---

## Atual

Não existe campo "atual" gravado. O valor gasto é **calculado on-demand** somando as transações EXPENSE da categoria (e das subcategorias filhas, se houver) no período:

```text id="c7m3qp"
Todas as EXPENSE da categoria (+ filhas) no período
```

---

## Cálculo

```text id="l2k7qp"
spentAmount = SUM(transactions.amount)
WHERE
  transactions.categoryId IN (budget.categoryId, <ids das categorias filhas de budget.categoryId>)
  AND date dentro do mês/ano (America/Sao_Paulo)
  AND type = EXPENSE
  AND isPaid = true
  AND deletedAt IS NULL
```

---

## Hierarquia de Categoria no Orçamento

Categorias podem ter subcategorias (ex: "Casa" com filhas "Energia", "Água", "Internet" — ver 24-CATEGORIES). Um orçamento criado na categoria **pai** deve somar também os gastos lançados diretamente nas categorias **filhas**, não só os gastos com `categoryId` exatamente igual ao da categoria do orçamento.

```text id="h5v9qp"
Orçamento: Casa → R$ 800/mês

Transações do mês:
  Energia   (categoria filha de Casa) → R$ 250
  Água      (categoria filha de Casa) → R$ 90
  Netflix   (categoria Casa direto)   → R$ 40

spentAmount do orçamento "Casa" = 250 + 90 + 40 = R$ 380
```

Um orçamento criado numa categoria **filha** (ex: "Energia") soma só as transações dessa filha — não sobe para o pai nem para as irmãs.

Isso resolve o gap de filtrar só `categoryId` exato: sem essa soma, gastos lançados em "Energia" ou "Água" ficariam de fora do orçamento de "Casa", subestimando o consumo real.

---

# Criação de Orçamento

## Fluxo

```text id="f3v8qn"
Selecionar categoria

Selecionar mês

Selecionar ano

Definir valor planejado

Salvar
```

---

# Interface

## Card de Budget

```text id="c8m2qp"
Alimentação

R$ 1.200 / R$ 1.500

████████░░ 80%

+R$ 300 restantes
```

---

# Estados Visuais

## Normal

Até 80%

---

## Atenção

80% a 100%

Cor laranja/vermelho leve

---

## Estourado

> 100%

Cor vermelha forte

---

# Dashboard

Orçamentos aparecem em:

* visão mensal
* alertas de gastos
* gráficos de consumo
* cards de categoria

---

# Regras de Negócio

## Regra 1

Um orçamento é único por categoria por mês.

---

## Regra 2

Transações atualizam orçamento automaticamente.

---

## Regra 3

Orçamento não altera transações.

---

## Regra 4

Orçamento é sempre derivado, nunca origem de dados.

---

# Filtros

```text id="f6v2qn"
Categoria

Mês

Ano

Status (ok, atenção, estourado)
```

---

# Integração com Transactions

Toda transação do tipo EXPENSE:

* entra automaticamente no cálculo do orçamento correspondente na próxima leitura (nada é gravado no Budget — ver "Hierarquia de Categoria no Orçamento")

---

# Integração com Categories

Cada orçamento está ligado a uma categoria específica.

---

# Regras de UX

* orçamento deve ser visível rapidamente
* feedback de estouro deve ser imediato
* progresso sempre visual
* evitar inputs complexos

---

# Alertas

O sistema pode alertar quando:

* 80% do orçamento foi atingido
* 100% foi atingido

Exemplo:

```text id="a8m3qp"
⚠ Você já usou 90% do orçamento de Alimentação
```

---

# Performance

* cálculo pode ser incremental
* evitar reprocessar tudo no frontend
* preferir agregações no backend

---

# Estados

## Empty

```text id="e3k7qp"
Nenhum orçamento criado.

[ Criar orçamento ]
```

---

# Filosofia

Orçamentos não são restrições.

São **consciência financeira ativa**.

Eles ajudam o usuário a entender:

> “Estou gastando mais do que deveria?”
