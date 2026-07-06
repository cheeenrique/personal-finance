# 04 - DESIGN_SYSTEM.md

# Design System

Este documento define toda a identidade visual da aplicação.

Fonte visual: `design/design-system.html` (protótipo interativo com os tokens reais, temas claro/escuro e componentes). Onde este documento e o protótipo divergirem, **o protótipo é a fonte da verdade**.

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

> Correção: a versão anterior deste documento invertia os papéis (laranja como primária, azul como secundária). O Design System real (`design-system.html`) define o oposto — segue abaixo.

## Primária

Azul escuro `#1E40AF` (token `--primary`, texto sobre ela `--primary-foreground` `#ffffff`).

Utilizada para:

* saldo, estrutura, confiança
* navegação ativa (item selecionado na sidebar/bottom nav)
* botão primário (ex.: "Transferir")

---

## Accent

Laranja `#EA580C` (token `--accent`, texto sobre ela `--accent-foreground` `#0B1223`).

Utilizada para:

* ações que movem dinheiro (nova transação, CTAs de ação)
* eyebrows (rótulo de seção em maiúsculas, ex. "01 — Fundamentos")

Regra prática: **primária = onde eu estou / estrutura**. **Accent = o que eu faço agora (ação que mexe em dinheiro)**.

---

## Neutras

Toda a interface deve utilizar neutros.

As cores devem aparecer apenas quando agregarem significado.

---

# Tokens (dark + light)

Tabela mapeada 1:1 pros nomes do shadcn/ui. Cola direto no `globals.css` do projeto (ver `design/design-system.html` para os valores aplicados ao vivo).

| Token shadcn | Uso | Dark (padrão) | Light |
|---|---|---|---|
| `--background` | fundo da página | `#0B1223` | `#F5F7FB` |
| `--foreground` | texto principal | `#F1F5F9` | `#0F1B2E` |
| `--card` / `--popover` | superfície de cards, popovers | `#141D30` | `#FFFFFF` |
| `--card-foreground` / `--popover-foreground` | texto sobre card/popover | `#F1F5F9` | `#0F1B2E` |
| `--secondary` (elevated/s2) | dropdowns, modais, chips, hover, trilhos | `#1F2A40` | `#EEF2F8` (elevated `#FFFFFF`) |
| `--muted-foreground` | texto secundário/legenda | `#93A2B8` | `#5B6B82` |
| `--border` | bordas, divisores | `#28344C` | `#E3E8F0` |
| `--input` | fundo de input | `rgba(255,255,255,0.03)` | `#FFFFFF` |
| `--primary` | ação estrutural/navegação ativa | `#1E40AF` | `#1E40AF` |
| `--primary-foreground` | texto sobre primary | `#ffffff` | `#ffffff` |
| `--accent` | ação que move dinheiro (CTA) | `#EA580C` | `#EA580C` |
| `--accent-foreground` | texto sobre accent | `#0B1223` | `#0B1223` |
| `--success` (receita) | valores positivos | `#16A34A` | `#16A34A` |
| on-success (ícone/texto sobre success tint) | — | `#4ADE80` | `#15803D` |
| `--destructive` (despesa) | valores negativos, ação destrutiva | `#EF4444` | `#EF4444` |
| on-destructive (ícone/texto sobre destructive tint) | — | `#F87171` | `#B91C1C` |
| `--warning` (alerta/vencendo) | conta a vencer, meta baixa | `#F59E0B` | `#F59E0B` |
| on-warning (ícone/texto sobre warning tint) | — | `#FBBF24` | `#B45309` |
| on-primary (ícone/texto sobre primary tint) | — | `#8FABFF` | `#1E40AF` |
| on-accent (ícone/texto sobre accent tint) | — | `#FB923C` | `#C2410C` |
| header (barra superior, sticky/blur) | — | `rgba(11,18,35,0.72)` | `rgba(255,255,255,0.82)` |
| shadow (cards, dropdowns) | — | `0 2px 12px rgba(0,0,0,0.35)` | `0 1px 3px rgba(15,23,42,0.08)` |

Primária e accent **não mudam entre temas** — só o fundo/superfície/borda invertem claro↔escuro.

---

# Tema

Suporte obrigatório para

* Light
* Dark
* System

Dark Mode deve ser o padrão.

---

# Tipografia

Duas famílias, cada uma com um papel fixo (substitui a regra anterior de "uma família só"):

* **Nunito** (400/500/600/700/800/900) — toda a UI: títulos, labels, corpo de texto, botões. Arredondada, amistosa, legível.
* **JetBrains Mono** (400/500/600) — **todo dado financeiro**: saldos, valores em R$, datas, percentuais. Regra fixa: número, dinheiro ou data sempre em mono, nunca em Nunito.

Escala (conforme `design-system.html`):

| Papel | Peso | Tamanho | Observação |
|---|---|---|---|
| Display | 900 | 34–52px | letter-spacing −0.02em a −0.03em; hero e valores grandes |
| Título | 800 | 20px | títulos de seção/card |
| Eyebrow | 800 | 12px | uppercase, cor accent, letter-spacing 0.16em |
| Corpo | 500 | 16px | cor muted-foreground |
| Dados/Mono | 500 | 16px | JetBrains Mono, valores/datas/percentuais |

A regra "nunca mais de 6 tamanhos diferentes" continua valendo como guia geral de disciplina visual — não confundir com "uma família só", que foi corrigido acima.

---

# Radius

Escala fixa de border-radius, base ~12px:

| Uso | Radius |
|---|---|
| Cards | 14–16px |
| Controles (botão, input) | 8–9px |
| Pills (badge, status) | 999px |
| Tiles de ícone | 12–14px |

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

Verde `#16A34A` (mesma cor de `--success`)

Despesa

Vermelho `#EF4444` (mesma cor de `--destructive`)

Transferência

Azul — **atenção:** como azul virou a cor primária da marca (`#1E40AF`), usar um tom distinto pra Transferência (azul/ciano mais claro, nunca o mesmo navy do `--primary`), senão a badge de Transferência se confunde com botão/nav primária.

Parcelamento

Laranja — **atenção:** como laranja virou `--accent` (cor de ação), Parcelamento pode visualmente colidir com botões de CTA. Se a badge de Parcelamento ficar perto de um botão accent na mesma tela, escolher um tom de laranja próprio (mais escuro/dessaturado) pra diferenciar "isto é uma categoria" de "isto é uma ação".

Patrimônio

Roxo (mantido, sem conflito com primária/accent)

Essas cores devem ser utilizadas em toda aplicação.

---

# Cores de Alerta

Utilizadas em Alertas/Insights (resumo semanal, anomalia, economia).

GOOD

Verde (reaproveita a cor de Receita/`--success`)

WARN

Âmbar `#F59E0B` (`--warning`, mesma cor de "Alerta/Vencendo" da Paleta — antes descrito como "Amarelo/Laranja", alinhado aqui ao token real)

DANGER

Vermelho (`--destructive`)

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
