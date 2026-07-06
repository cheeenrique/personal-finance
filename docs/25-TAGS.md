# 25 - TAGS.md

# Tags

Tags são marcadores livres que permitem contextualizar transações.

Diferente de categorias, tags não são obrigatórias e não seguem estrutura hierárquica.

---

# Objetivo

Permitir que o usuário consiga:

* agrupar gastos por contexto
* criar análises personalizadas
* marcar eventos específicos
* complementar categorias
* facilitar filtros rápidos

---

# Regra Principal

Tags são opcionais.

Uma transação pode ter:

* nenhuma tag
* uma tag
* várias tags

---

# Estrutura da Tag

```text id="t1k8qp"
id (cuid)

userId

name

color

createdAt

deletedAt
```

---

# Exemplos de Tags

```text id="e4v2qn"
Filho
Viagem
MacBook
Carro
Apartamento
Natal
Trabalho
Saúde
```

---

# Diferença entre Tags e Categorias

## Categorias

* obrigatórias
* estruturais
* hierárquicas
* usadas em relatórios oficiais

## Tags

* opcionais
* livres
* contextuais
* usadas para análise flexível

---

# Exemplo Prático

```text id="x7m3qp"
Transação:

Categoria: Alimentação
Tags: Filho, Viagem
```

---

# Criação de Tag

## Fluxo

```text id="c3v8qn"
Nome

Cor (opcional)

Salvar
```

---

# Interface

## Lista de Tags

Exibida como chips:

```text id="l2k7qp"
[ Filho ] [ Viagem ] [ MacBook ] [ Carro ]
```

---

# Uso nas Transações

Tags podem ser adicionadas:

* no momento da criação
* na edição
* via atalhos rápidos

---

# UX de Seleção

Tags devem ser:

* pesquisáveis
* selecionáveis rapidamente
* criáveis no momento da digitação

Exemplo:

```text id="u8k3qp"
Digite: "Filho"
→ cria nova tag automaticamente
```

---

# Filtros

```text id="f6v2qn"
Tags selecionadas

Período

Categoria

Conta

Cartão
```

---

# Regras de Negócio

## Regra 1

Tags não afetam saldo ou relatórios financeiros obrigatórios.

---

## Regra 2

Tags não substituem categorias.

---

## Regra 3

Tags são apenas enriquecimento de dados.

---

# Relatórios com Tags

Permitir análises como:

* quanto gastei com "Filho"
* quanto gastei em "Viagem"
* quanto gastei no "MacBook"

---

# Dashboard

Tags podem aparecer em:

* filtros rápidos
* insights personalizados
* análises exploratórias

---

# Performance

* tags devem ser indexadas
* busca deve ser instantânea
* autocomplete obrigatório

---

# Integração com Transactions

Uma transação pode ter várias tags, sempre via tabela de junção `TransactionTag` — **não existe campo `tags[]` inline em Transaction**.

```text id="p1v8qn"
TransactionTag
  transactionId (cuid, FK Transaction)
  tagId (cuid, FK Tag)
```

---

# Regras de UX

* tags devem ser leves visualmente
* devem aparecer como chips
* devem ser removíveis com um clique
* devem permitir criação rápida

---

# Estados

## Empty

```text id="e3k7qp"
Nenhuma tag criada.

[ Criar primeira tag ]
```

---

# Importância no Sistema

Tags permitem responder perguntas como:

* quanto gastei com meu filho?
* quanto gastei na viagem?
* quanto já investi no MacBook?

Sem precisar alterar categorias.

---

# Filosofia

Tags representam o contexto humano do dinheiro.

Elas capturam o “por quê” do gasto.

Enquanto categorias dizem “o que é”,

tags dizem “por que aconteceu”.
