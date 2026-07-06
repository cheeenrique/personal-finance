# 02 - ARCHITECTURE.md

# Arquitetura da Aplicação

Este documento define a arquitetura da aplicação, organização dos módulos, responsabilidades de cada camada e fluxo de funcionamento do sistema.

O principal objetivo é manter um código simples, organizado e fácil de evoluir.

---

# Arquitetura

A aplicação será um **Monólito Modular (Modular Monolith)**.

Cada domínio da aplicação será isolado em seu próprio módulo.

Não haverá microserviços.

Não haverá separação entre frontend e backend.

Toda a aplicação será construída em um único projeto Next.js.

---

# Benefícios

* Deploy simples
* Menor complexidade
* Desenvolvimento mais rápido
* Fácil manutenção
* Excelente organização
* Escalável para o tamanho do projeto

---

# Organização

```text
src/

├── app/
├── modules/
├── shared/
├── components/
├── hooks/
├── lib/
├── prisma/
└── types/
```

---

# App

Responsável apenas pelo roteamento da aplicação.

Não deve conter regra de negócio.

Exemplo:

```text
app/

dashboard/

transactions/

cards/

accounts/

settings/

api/
  telegram/
  cron/
```

Cada página apenas organiza componentes.

`app/api/` existe **apenas** para o webhook do Telegram e os crons — o resto do app usa Server Actions, nunca Route Handler.

---

# Modules

Toda regra da aplicação vive dentro dos módulos.

Cada módulo representa um domínio.

Exemplo:

```text
modules/

auth/

dashboard/

transactions/

accounts/

cards/

categories/

tags/

installments/

budgets/

assets/

reports/

settings/

telegram/
```

---

# Isolamento por Usuário

Projeto para exatamente 2 usuários (dono + esposa). Contas isoladas por userId, sem household/compartilhamento. Não é multiusuário/SaaS.

Todas as entidades pertencem obrigatoriamente a um usuário.

Nenhum módulo pode acessar dados sem considerar o usuário autenticado.

Toda consulta ao banco deve ser filtrada por:

userId

---

# Estrutura de um módulo

```text
transactions/

components/

actions/

repository/

services/

schemas/

types/

constants/

utils/
```

Estrutura de referência para módulos com regra de negócio relevante (transactions, cards, installments). Não é obrigatória pasta a pasta — módulos triviais (ex.: Tags, que é só id/name/color) podem viver em 1-2 arquivos. A estrutura cresce sob demanda, conforme o módulo ganha complexidade real, não antecipadamente.

---

# Components

Contém componentes exclusivos daquele módulo.

Exemplo:

TransactionForm

TransactionTable

TransactionFilters

TransactionCard

TransactionDetails

Esses componentes nunca devem ser utilizados diretamente por outro módulo.

Caso um componente seja compartilhado, ele deve ser movido para `shared`.

---

# Actions

Responsáveis pela comunicação entre a interface e a regra de negócio.

Utilizam Server Actions.

Exemplo:

createTransaction()

updateTransaction()

deleteTransaction()

listTransactions()

---

# Services

Contêm todas as regras de negócio.

Exemplos:

* validar lançamento
* calcular saldo
* gerar parcelas
* calcular patrimônio

Nenhuma regra de negócio deve existir em componentes React.

---

# Repository

Responsável apenas pelo acesso ao banco.

Pode utilizar Prisma.

Nunca realizar cálculos ou validações.

Exemplo:

findById()

findMany()

create()

update()

delete()

---

# Schemas

Todos os Schemas Zod ficam aqui.

Exemplo:

TransactionSchema

CardSchema

CategorySchema

---

# Types

Tipos específicos do módulo.

Nunca criar tipos globais sem necessidade.

---

# Constants

Valores fixos do domínio.

Exemplo:

Tipos de transação

Status

Cores

Ícones

---

# Utils

Funções auxiliares específicas do módulo.

Se forem reutilizadas por vários módulos, mover para `shared`.

---

# Shared

Contém tudo que pode ser reutilizado.

Exemplo:

Button

Input

Dialog

Table

Currency

Date

Badge

Card

Modal

Pagination

---

# Lib

Integrações globais.

Exemplo:

Prisma Client

Auth

Date Helpers

Currency Helpers

Telegram

---

# Fluxo de uma Requisição

Sempre seguir o mesmo fluxo.

```text
Usuário

↓

Página

↓

Componente

↓

Server Action

↓

Service

↓

Repository

↓

Prisma

↓

Banco
```

Nunca pular etapas.

---

# Fluxo de Criação de Transação

```text
Usuário

↓

Preenche formulário

↓

Server Action

↓

Validação Zod

↓

Transaction Service

↓

Repository

↓

Banco

↓

Revalidate Path

↓

Toast

↓

Atualiza Dashboard
```

---

# Fluxo de Autenticação

```text
Visitante

↓

Login

↓

Sessão criada

↓

Middleware

↓

Dashboard
```

---

# Comunicação entre módulos

Módulos não devem depender diretamente uns dos outros.

Exemplo:

Dashboard pode utilizar TransactionService.

Transaction nunca deve importar Dashboard.

Sempre respeitar o sentido da dependência.

---

# Sidebar

A navegação principal será fixa.

Itens:

Dashboard

Transações

Cartões

Contas

Orçamentos

Patrimônio

Relatórios

Configurações

No mobile:

Bottom Navigation + Drawer.

---

# Navegação

Toda funcionalidade importante deve estar acessível em no máximo 3 cliques.

Evitar menus escondidos.

Evitar navegação excessiva.

---

# Modal vs Página

Criar

Editar

Visualizar rapidamente

↓

Utilizar Dialog.

Visualizações completas

↓

Utilizar Página.

---

# Padrão de CRUD

Todo módulo deve possuir.

Listagem

Detalhes

Criar

Editar

Excluir

Sempre no mesmo padrão visual.

---

# Atualização de Dados

Após qualquer alteração.

Utilizar:

RevalidatePath()

Nunca solicitar refresh manual da página.

---

# Paginação

Paginação server-side apenas na listagem de **Transactions** (única lista que cresce de forma relevante).

Contas, cartões, categorias, tags e assets: listar tudo, sem paginação server-side.

---

# Busca

Toda listagem deve possuir busca.

Sempre localizada acima da tabela.

---

# Filtros

Filtros sempre ficam acima da tabela.

Nunca dentro da tabela.

---

# Ordenação

Todas as tabelas devem permitir ordenação.

Pelo menos por:

Data

Descrição

Valor

---

# Formulários

Sempre utilizar:

Dialog Desktop

Drawer Mobile

Nunca abrir páginas apenas para cadastro.

---

# Feedback Visual

Toda ação deve retornar feedback.

Exemplos:

✔ Transação criada.

✔ Categoria removida.

✔ Cartão atualizado.

---

# Estados

Toda tela deve possuir.

Loading

Error

Empty

Success

Sem exceções.

---

# Dashboard

O Dashboard nunca consulta diretamente o banco.

Ele utiliza Services especializados para montar os indicadores.

Isso facilita futuras otimizações.

---

# Relatórios

Os relatórios utilizam exatamente os mesmos dados das transações.

Nunca duplicar lógica.

---

# Extensibilidade

Novos módulos seguem a mesma estrutura de referência quando fizer sentido pela complexidade.

Exemplo:

subscriptions/

components/

actions/

services/

repository/

schemas/

types/

constants/

utils/

Módulo simples pode nascer com menos pastas e crescer sob demanda — não adiantar estrutura para complexidade que ainda não existe.

---

# Decisões Arquiteturais

## Monólito

Escolhido por simplicidade.

## PostgreSQL

Escolhido pela natureza relacional dos dados financeiros.

## Prisma

Produtividade.

## Server Actions

Reduz necessidade de APIs internas.

## Modularização

Facilita manutenção.

## Reutilização

Evitar duplicação.

---

# Regra Principal

Sempre que surgir uma dúvida sobre arquitetura, escolher a solução que:

* reduza complexidade;
* mantenha os módulos independentes;
* facilite a leitura do código;
* exija menos código para manter.

Arquitetura simples é um requisito do projeto.
