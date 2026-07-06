# 04 - DESIGN_SYSTEM.md

# Design System

Este documento define toda a identidade visual da aplicação.

O objetivo é criar uma interface limpa, moderna e extremamente rápida de utilizar.

O usuário deve conseguir identificar rapidamente as informações mais importantes sem excesso de elementos visuais.

---

# Filosofia

A interface deve transmitir:

* organização
* clareza
* confiança
* velocidade
* controle

Nunca transmitir sensação de sistema complexo.

O usuário deve sentir que tudo está exatamente onde espera encontrar.

---

# Inspirações

A interface deve seguir conceitos encontrados em produtos como:

* Linear
* Vercel Dashboard
* Stripe Dashboard
* GitHub
* Raycast
* Notion

Não copiar nenhum produto.

Apenas utilizar os conceitos de simplicidade e organização.

---

# Paleta

## Primária

Laranja

Utilizada para:

* ações principais
* botões primários
* indicadores importantes

---

## Secundária

Azul

Utilizada para:

* links
* informações
* gráficos

---

## Neutras

Toda a interface deve utilizar neutros.

As cores devem aparecer apenas quando agregarem significado.

---

# Tema

Suporte obrigatório para

* Light
* Dark
* System

Dark Mode deve ser o padrão.

---

# Tipografia

Utilizar apenas uma família tipográfica.

Hierarquia

```text
H1

H2

H3

Body

Small

Muted
```

Nunca utilizar mais de 6 tamanhos diferentes.

---

# Layout

Desktop

```text
┌──────────────────────────────────────────┐
│ Sidebar │                                │
│         │ Header                         │
│         │─────────────────────────────── │
│         │                                │
│         │ Conteúdo                       │
│         │                                │
└──────────────────────────────────────────┘
```

Mobile

* Bottom Navigation
* Drawer

Nunca Sidebar.

---

# Header

Sempre possui

Título

Descrição

Pesquisa Global

Ações rápidas

Perfil

---

# Pesquisa Global

Atalho

Ctrl + K

Deve pesquisar

* transações
* cartões
* contas
* categorias
* tags
* patrimônio

A pesquisa deve ser instantânea.

---

# Cards

Todos os cards seguem o mesmo padrão.

```text
Título

Valor Principal

Descrição

Indicador

Ação opcional
```

Exemplo

```text
Saldo Atual

R$ 12.430

+8%

Última atualização hoje
```

---

# KPI Cards

Utilizados no Dashboard.

Todos possuem

Ícone

Título

Valor

Variação

Nunca mais de uma informação principal.

---

# Botões

Existem apenas quatro tipos.

Primary

Secondary

Outline

Ghost

Evitar novos estilos.

---

# Inputs

Sempre possuem

Label

Placeholder

Mensagem de erro

Nunca utilizar apenas placeholder.

---

# Select

Mesmo padrão para toda aplicação.

Pesquisa quando houver mais de 10 itens.

---

# Tabelas

Todas as tabelas utilizam o mesmo componente.

Sempre possuem

Busca

Filtros

Ordenação

Seleção

Ações

Paginação apenas em Transactions (única lista que cresce sem limite). Contas, cartões, categorias, tags, assets: listar tudo, sem paginação server-side.

---

# Gráficos

Sempre simples.

Evitar excesso de informações.

Obrigatórios

Tooltip

Responsividade

Loading

Empty State

Legenda

---

# Cores Financeiras

Receita

Verde

Despesa

Vermelho

Transferência

Azul

Parcelamento

Laranja

Patrimônio

Roxo

Essas cores devem ser utilizadas em toda aplicação.

---

# Cores de Alerta

Utilizadas em Alertas/Insights (resumo semanal, anomalia, economia).

GOOD

Verde (reaproveita a cor de Receita)

WARN

Amarelo/Laranja

DANGER

Vermelho

---

# Badges

Utilizar para

Status

Categoria

Tag

Tipo

Nunca utilizar Badge apenas por estética.

---

# Dialog

Desktop

Dialog centralizado.

---

# Drawer

Mobile

Todo formulário abre em Drawer.

---

# Espaçamento

Utilizar escala consistente.

Nunca definir espaçamentos aleatórios.

---

# Responsividade

Breakpoints

Mobile

Tablet

Desktop

Wide

A interface deve funcionar em todas as resoluções.

---

# Empty State

Toda tela deve possuir Empty State.

Exemplo

```text
Nenhuma transação encontrada.

[ Criar primeira transação ]
```

---

# Loading

Utilizar Skeleton.

Nunca Spinner ocupando toda a tela.

---

# Feedback

Toda ação deve gerar feedback visual.

Exemplos

✔ Cartão criado

✔ Transação salva

✔ Categoria removida

---

# Dashboard

O Dashboard deve ocupar praticamente toda a primeira dobra da tela.

Sem necessidade de scroll para visualizar os principais indicadores.

---

# Tamanho dos Componentes

Priorizar componentes compactos.

Exibir mais informação com menos espaço.

Evitar grandes áreas vazias.

---

# Ícones

Utilizar apenas Lucide.

Mesmo tamanho.

Mesmo estilo.

---

# Ações Rápidas

Sempre acessíveis.

Exemplos

Nova Receita

Nova Despesa

Nova Transferência

Novo Cartão

Nova Conta

---

# Consistência

Todo componente deve possuir comportamento idêntico em toda aplicação.

Exemplo

Uma tabela de transações deve se comportar exatamente como uma tabela de categorias.

---

# Animações

Utilizar animações discretas.

Transições rápidas.

Nunca utilizar animações longas.

---

# Performance Visual

A interface deve parecer instantânea.

Mesmo quando houver carregamento.

Utilizar Skeleton.

Atualizações devem parecer imediatas (optimistic UI).

---

# Filosofia Final

A interface deve desaparecer.

O usuário não deve pensar em como utilizar o sistema.

Ele apenas realiza suas ações naturalmente.

Toda decisão visual deve favorecer:

* rapidez
* simplicidade
* consistência
* clareza
* conforto de leitura
