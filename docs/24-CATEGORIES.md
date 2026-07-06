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

Sem categorias pré-cadastradas a primeira transação do usuário travaria (categoria é obrigatória, exceto TRANSFER). Por isso o `prisma db seed` cria um conjunto granular de categorias — pai e filhas, usando o próprio `parentId` do schema — pros 2 usuários (casal) já no primeiro deploy. Objetivo: cobrir o dia a dia do casal sem precisar criar categoria manualmente, com filha específica pra maioria dos lançamentos comuns.

## Despesas (type = EXPENSE)

```text id="s2k9pq"
Alimentação
 ├── Mercado
 ├── Restaurante/Lanche
 ├── Delivery
 └── Padaria

Casa
 ├── Aluguel/Financiamento
 ├── Energia
 ├── Água
 ├── Gás
 ├── Internet
 ├── Telefone
 ├── Condomínio
 └── Manutenção

Transporte
 ├── Combustível
 ├── Uber/99/Táxi
 ├── Transporte público
 ├── Estacionamento
 ├── Manutenção do carro
 └── IPVA/Seguro

Saúde
 ├── Plano de saúde
 ├── Farmácia
 ├── Consultas
 └── Academia

Lazer
 ├── Streaming/Assinaturas
 ├── Cinema/Shows
 ├── Viagens
 ├── Restaurantes
 └── Hobbies

Educação
 ├── Cursos
 ├── Livros
 └── Mensalidade

Compras
 ├── Vestuário
 ├── Eletrônicos
 ├── Presentes
 └── Casa/Decoração

Filhos/Pets
 ├── Escola
 ├── Creche
 └── Pet

Finanças
 ├── Tarifas bancárias
 ├── Juros
 ├── Impostos
 └── Investimento (aporte)

Outros
```

`Outros` (pai, sem filhas, `type = EXPENSE`) é o mesmo fallback usado pelo parser do Telegram quando a inferência de categoria é ambígua ou não reconhece nada (ver Regra 2 em 30-TELEGRAM) — nunca deletar nem renomear essa categoria sem ajustar o parser junto.

`Filhos/Pets` é opcional por casal — se o schema/onboarding evoluir pra pular categorias fora do perfil do usuário, esse é o primeiro grupo candidato a ficar de fora do seed padrão.

---

## Receitas (type = INCOME)

Categorias de receita são pais próprios, sem filhas no seed inicial (casal pode adicionar subcategoria depois se sentir necessidade):

```text id="i4k8qp"
Salário
Freelance/Extra
Rendimentos
Reembolso
Presente/Doação
Outros (Receita)
```

`Outros (Receita)` existe separado do `Outros` de despesa pra não colidir na hora de ler relatório ou histórico do bot — mesmo com `type` diferenciando as duas no banco, nome repetido confunde na tela e na conversa do Telegram.

---

## Regra de Tipo

Category já tem o campo `type` (`INCOME` | `EXPENSE`) no schema — não é preciso schema novo pra separar receita de despesa. O seed marca cada categoria com o `type` correto na criação; a tela de nova transação filtra o seletor de categoria pelo `type` da transação sendo criada (transação `EXPENSE` só lista categorias `EXPENSE`, `INCOME` só lista `INCOME`). Categoria pai e categoria filha sempre têm o mesmo `type` — filha nunca diverge do `type` do pai.

---

## Regra de Execução

* seed roda via `prisma db seed`, junto da criação dos 2 usuários (ver 10-AUTH) — mesmo script, mesma transação de setup inicial.
* pais são criados primeiro (sem `parentId`), filhas em seguida referenciando o `id` do pai já criado.
* seed é idempotente: rodar de novo não duplica categoria já existente pro mesmo usuário.
* usuário pode editar nome/ícone/cor, mover filha pra outro pai, remover ou criar categoria nova livremente depois — o seed é só o ponto de partida pra evitar tela vazia bloqueando o primeiro lançamento.

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
