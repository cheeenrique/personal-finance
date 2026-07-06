# 24 - CATEGORIES.md

# Categorias

Categorias representam a estrutura principal de organização das transações.

Elas são responsáveis por permitir análise, relatórios e controle de gastos.

---

# Objetivo

Permitir que o usuário consiga:

* entender onde está gastando dinheiro
* agrupar despesas e receitas
* analisar padrões de consumo
* visualizar relatórios claros no dashboard

---

# Regra Principal

Toda transação deve obrigatoriamente pertencer a uma categoria, **exceto transações do tipo TRANSFER**, que nascem com `categoryId = null` (transferência entre contas não é gasto nem receita, não faz sentido categorizar — ver 20-TRANSACTIONS).

---

# Estrutura da Categoria

```text id="c1k8pq"
id

userId

name

icon

color

type

parentId

createdAt

updatedAt

deletedAt
```

---

# Tipos de Categoria

```text id="t4v2qn"
INCOME   → receitas
EXPENSE  → despesas
```

---

# Hierarquia

Categorias podem ser:

## Pai

Ex:

```text id="p1m8qn"
Casa
Carro
Alimentação
```

## Filho

Ex:

```text id="f7k3qp"
Casa
 ├── Energia
 ├── Água
 ├── Internet
```

---

# Regra de Hierarquia

* categorias pai podem ter filhos
* filhos pertencem a um único pai
* relatórios podem usar nível pai ou filho

---

# Seed de Categorias Padrão

Sem categorias pré-cadastradas a primeira transação do usuário travaria (categoria é obrigatória, exceto TRANSFER). Por isso o `prisma seed` cria estas categorias padrão (tipo `EXPENSE`, nível pai, sem `parentId`) para os 2 usuários já no primeiro deploy:

```text id="s2k9pq"
Alimentação
Casa
Carro/Transporte
Lazer
Saúde
Mercado
Contas Fixas
Outros
```

São as mesmas categorias usadas nos cards e gráficos do Dashboard. O usuário pode renomear, adicionar subcategorias ou criar novas categorias livremente depois — o seed é só o ponto de partida pra evitar tela vazia bloqueando o primeiro lançamento.

---

# Criação de Categoria

## Fluxo

```text id="c3v8qn"
Nome

Tipo (receita/despesa)

Ícone

Cor

Categoria pai (opcional)

Salvar
```

---

# Interface

## Lista de Categorias

Exibidas em árvore:

```text id="l2k7qp"
Casa
 ├── Energia
 ├── Água
 ├── Internet

Carro
 ├── Combustível
 ├── Seguro
```

---

# Uso nas Transações

Cada transação deve ter:

* categoryId obrigatório, **exceto em TRANSFER** (categoryId = null)

---

# Regras de Negócio

## Regra 1

Categoria não pode ser nula, **exceto em transações do tipo TRANSFER** (categoryId = null).

---

## Regra 2

Categoria define comportamento analítico.

---

## Regra 3

Transações herdadas de cartão ou parcelamento continuam usando categoria.

---

# Relatórios

Categorias alimentam diretamente:

* gastos por categoria
* ranking de despesas
* evolução mensal
* análise de comportamento

---

# Dashboard

Categorias aparecem em:

* gráfico de pizza
* gráfico de barras
* filtros rápidos
* cards resumidos

---

# Tags vs Categorias

## Categorias

* estruturais
* fixas
* obrigatórias
* usadas para relatórios

## Tags

* livres
* temporárias
* contextuais
* múltiplas

Exemplo:

```text id="t8m2qn"
Categoria: Alimentação
Tag: Viagem, Filho
```

---

# Filtros

```text id="f6v2qn"
Categoria pai

Categoria filha

Tipo

Período

Tags
```

---

# Estados

## Empty

```text id="e3k7qp"
Nenhuma categoria criada.

[ Criar categoria ]
```

---

# Performance

* categorias devem ser cacheadas
* estrutura de árvore carregada uma vez
* evitar joins pesados em lista

---

# Regras de UX

* categorias devem ser fáceis de selecionar
* busca deve ser instantânea
* árvore deve ser colapsável
* cores ajudam identificação rápida

---

# Cores

Cada categoria pode ter cor para:

* gráficos
* badges
* visualização rápida

---

# Ícones

Categorias devem sempre ter ícone.

Isso ajuda na leitura rápida do sistema.

---

# Integração com Transactions

Categorias são obrigatórias em:

* receitas
* despesas
* parcelas
* cartões

---

# Integração com Dashboard

Categorias alimentam:

* visão de gastos
* comparativo mensal
* insights financeiros

---

# Regra de Consistência

Categoria define o significado da transação.

Sem categoria, a transação perde contexto.

---

# Filosofia

Categorias são a linguagem do sistema.

Elas respondem à pergunta:

> “Em que tipo de coisa eu estou gastando dinheiro?”

Se bem estruturadas:

* relatórios ficam claros
* decisões financeiras ficam fáceis
