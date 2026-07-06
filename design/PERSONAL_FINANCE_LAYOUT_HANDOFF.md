# Personal Finance — Layout & Componentes Handoff

Referência visual viva: **`Personal Finance App.dc.html`** (abra no navegador — tem todas as telas, navegação funcional e temas claro/escuro). Este arquivo é a fonte de verdade; o código abaixo é o que implementar no Next.js.

---

# Sistema de Design

O layout é baseado no **Personal Finance Design System** (`Personal Finance Design System.dc.html`), reaproveitando a mesma arquitetura do LocaHub (tokens via CSS vars, Nunito + JetBrains Mono, temas dark/light).

## Tokens de Cor (CSS vars)

```css
:root {
  --pf-bg: #0B1223;                    /* Fundo principal (navy) */
  --pf-surface: #141D30;               /* Cards e superfícies */
  --pf-elevated: #1A2438;              /* Popovers, menus, modals */
  --pf-s2: #1F2A40;                    /* Superfícies secundárias (trilhos, chips) */
  --pf-border: #28344C;                /* Bordas */
  --pf-input: rgba(255,255,255,0.03); /* Inputs e backgrounds leves */
  
  --pf-text: #F1F5F9;                  /* Texto principal */
  --pf-muted: #93A2B8;                 /* Texto secundário */
  
  --pf-primary: #1E40AF;               /* Azul escuro (navegação, primária) */
  --pf-primary-fg: #ffffff;
  --pf-accent: #EA580C;                /* Laranja escuro (ações) */
  --pf-accent-fg: #0B1223;
  
  --pf-success: #16A34A;               /* Verde (receita, positivo) */
  --pf-warning: #F59E0B;               /* Amarelo/laranja (atenção) */
  --pf-danger: #EF4444;                /* Vermelho (crítico, despesa) */
  --pf-transfer: #38BDF8;              /* Ciano (transferência) */
  --pf-asset: #A855F7;                 /* Roxo (patrimônio) */
  
  /* Variantes "on" para texto em fundo colorido */
  --pf-on-primary: #8FABFF;
  --pf-on-success: #4ADE80;
  --pf-on-warning: #FBBF24;
  --pf-on-danger: #F87171;
  --pf-on-transfer: #7DD3FC;
  --pf-on-asset: #C99DF6;
  
  --pf-shadow: 0 2px 12px rgba(0,0,0,0.35);
  --pf-header: rgba(11,18,35,0.82);
}
```

## Tipografia

- **Fonte:** Nunito (400–900) + JetBrains Mono (500–600 para dados/números)
- **Escalas:**
  - Display (H1): 28–52px, weight 900, tracking -0.02/–0.03em
  - H2 seção: 24–38px, weight 900, tracking -0.02em
  - Título de card: 16–20px, weight 800
  - Eyebrow: 11–12px, weight 800, UPPERCASE, tracking 0.16em
  - Rótulo de campo: 13px, weight 700
  - Corpo/subtítulo: 14–18px, weight 500
  - Overline de tabela: 11px, weight 800, UPPERCASE, tracking 0.05em
  - Dados/números: JetBrains Mono, weight 500–600

## Raios

- Botões/inputs: `rounded-md` (10px)
- Cards: `rounded-xl` (14–16px)
- Modais: 18px
- Badges/chips: `rounded-full` (999px)
- Quadrados de ícone: 10–11px

---

# Layout Shell (Principal)

Padrão em todas as telas autenticadas. `/login` não usa este shell.

## Desktop (1280px+)

```
┌─────────┬────────────────────────────────────────────┐
│ SIDEBAR │ HEADER (sticky)                           │
│         ├────────────────────────────────────────────┤
│ Fixa    │ MAIN CONTENT (scrollável)                  │
│ 248px   │                                             │
└─────────┴────────────────────────────────────────────┘
```

### Sidebar (esquerda, fixa)

**Dimensões:**
- Largura normal: 248px
- Largura recolhida: 74px
- Altura: 100vh
- Transição: largura em 200ms ease

**Composição:**
1. **Brand** (topo, 56px altura + 12px padding)
   - Ícone com fundo gradiente azul (38×38px)
   - Wordmark "Personal" / "Finance" (apilado) — apenas quando expandido, quando recolhido só mostra tooltip no hover
   - Logotipo: gráfico ascendente (lucide `TrendingUp`) em laranja (`--pf-accent`) dentro de um quadrado com gradiente azul

2. **Navegação** (flex column, flex:1, overflow-y:auto, padding 12px, gap 3px)
   - 12 itens, cada um:
     - Altura: 36px
     - Padding: 0 12px
     - Border-radius: 10px
     - Ícone (19×19px, lucide) + label (apenas quando expandido)
     - **Estado ativo:** 
       - Fundo: color-mix(--pf-primary, 14%)
       - Borda esquerda: 3px solid --pf-primary
       - Peso: 800
       - Cor: --pf-text
     - **Estado inativo:**
       - Fundo: transparent
       - Cor: --pf-muted
       - Hover: cor vira --pf-text
   - Navegação: `useRouter` (Next.js App Router), compara `pathname` com cada rota
   - Itens (nesta ordem):
     1. Dashboard → /dashboard
     2. Transações → /transactions
     3. Contas → /accounts
     4. Cartões → /cards
     5. Parcelamentos → /installments
     6. Orçamentos → /budgets
     7. Patrimônio → /assets
     8. Categorias → /categories
     9. Tags → /tags
     10. Relatórios → /reports
     11. Alertas → /alerts
     12. Configurações → /settings

3. **Rodapé** (padding 12px, border-top 1px --pf-border, display flex)
   - Avatar circular (34×34px, iniciais em branco, fundo laranja gradiente)
   - Nome do usuário + email (apenas quando expandido, apilado, line-height 1.2)
     - Nome: 13px weight 800
     - Email: 11px --pf-muted weight 600
   - Botão de colapsar (apenas quando expandido)
     - Ícone: seta esquerda
     - Size: 16×16px
   - **Quando recolhido:** flexDirection muda para column, gap 8px, todos centralizados (avatar, botão)

### Header (topo, sticky, z-index 20)

**Dimensões:**
- Altura: 56px (14px padding vertical + 28px conteúdo)
- Padding: 14px 28px
- Position: sticky top 0
- Backdrop: `backdrop-filter: blur(14px)`
- Background: `var(--pf-header)` com opacidade (rgba(11,18,35,0.82))
- Border-bottom: 1px solid --pf-border

**Composição (flex, gap 20px, align-items center):**

1. **Título e descrição** (flex:1)
   - Título dinâmico por rota (map mantido num só lugar)
   - Font: 20px weight 900, letter-spacing -0.02em
   - Descrição: 12.5px --pf-muted weight 600, margin-top 2px
   - Ex.: "Dashboard" / "Sua vida financeira agora"

2. **Busca global** (Ctrl+K)
   - Estilo input: 200px min-width até 340px max, height 38px
   - Padding: 0 12px
   - Border-radius: 10px
   - Border: 1px --pf-border
   - Background: --pf-input
   - Ícone lupa (15×15px) à esquerda
   - Placeholder: "Buscar…" (sem exemplo de comando, simples)
   - Foco: border-color --pf-primary
   - Comportamento: abre Command Palette em overlay modal (não implementado no wireframe, descrito em docs)

3. **Botão "+ Nova transação"** (ação primária)
   - Altura: 38px
   - Padding: 0 16px
   - Border-radius: 11px
   - Background: --pf-accent
   - Color: --pf-accent-fg
   - Font: 13.5px weight 700
   - Ícone: `Plus` (lucide) à esquerda, 15×15px
   - Comportamento: abre FormModal de transação
   - Atalho: Ctrl+N (global)

4. **Toggle de tema** (luz/escuro/sistema)
   - Altura: 38px
   - Padding: 0 12px
   - Border-radius: 10px
   - Border: 1px --pf-border
   - Background: --pf-surface
   - Ícone: Sun (light) / Moon (dark)
   - Label: "Claro" / "Escuro"
   - Comportamento: aplica imediatamente (localStorage + CSS var update)

5. **Avatar + Dropdown** (perfil)
   - Avatar circular: 38×38px, iniciais em branco, fundo laranja gradiente
   - Clique abre dropdown (Configurações, Sair — logout)
   - Estilo dropdown: bg --pf-elevated, border 1px --pf-border, border-radius 10px

## Mobile / Tablet (< 1280px)

**Mudanças:** Sidebar desaparece, Bottom Navigation aparece (ver seção abaixo).

---

# Bottom Navigation (Mobile)

Substitui sidebar em mobile. Nunca ambos ao mesmo tempo.

**Dimensões:**
- Altura: 64px
- Position: fixed bottom 0
- Width: 100%
- Background: --pf-surface
- Border-top: 1px --pf-border
- Padding: 0
- Display: flex gap 0 align-items center justify-content space-between

**Composição:**

5 botões + 1 botão central destacado:

```text
Dashboard | Transações | [+] | Cartões | Menu
```

1. **Dashboard, Transações, Cartões** (3 itens)
   - Width: flex 1
   - Height: 64px
   - Display: flex, flex-direction column, align-items center, justify-content center
   - Ícone: 20×20px
   - Label: 10px weight 700
   - **Estado ativo:** ícone + label em --pf-accent, fundo tint
   - **Estado inativo:** --pf-muted

2. **Botão central [+]** (Nova transação)
   - Position: absolute bottom 32px (offset para ficar acima da nav)
   - Width: 48px height 48px
   - Border-radius: 999px
   - Background: --pf-accent
   - Ícone: Plus branco, 24×24px
   - Box-shadow: 0 6px 16px color-mix(--pf-accent 45%, transparent)
   - Comportamento: abre FormDrawer de transação (não modal)

3. **Menu** (último item)
   - Ícone: Menu (3 linhas horizontais)
   - Comportamento: abre Drawer lateral com navegação completa (Contas, Parcelamentos, Orçamentos, Patrimônio, Categorias, Tags, Relatórios, Alertas, Configurações)

---

# Componentes Padrão

## Card

```
┌─────────────────────────────────┐
│ [header]      [ação ou descrição]│
├─────────────────────────────────┤
│ [conteúdo]                       │
└─────────────────────────────────┘
```

**Estilo:**
- Border-radius: 16px
- Border: 1px --pf-border
- Background: --pf-surface
- Box-shadow: var(--pf-shadow)
- Padding: 16–18px (header), 18px (body)

**Header** (se houver):
- Border-bottom: 1px --pf-border
- Font: 14px weight 800
- Display flex entre título e ação/descrição

## KPICard

Para Dashboard e telas de detalhe.

```
┌─────────────────────────────────────────┐
│ [ícone em quadrado] [título]             │
│                                           │
│               [valor grande]              │
│               [variação/contexto]         │
└─────────────────────────────────────────┘
```

**Dimensões:**
- Altura: 160–180px
- Padding: 20px
- Flex: 1 (em grid)

**Composição:**
- Ícone: 30×30px em quadrado com raio 10px, fundo color-mix(cor 16%, transparent), ícone na cor on-*
- Título: 13px weight 700 --pf-muted
- Valor: JetBrains Mono, 24–28px weight 600, cor variável (verde para receita, vermelho para despesa, etc.)
- Variação: 12px weight 600 --pf-muted ou cor (seta + %), opcional

**Grid no dashboard:**
- 3 colunas em desktop
- 2 colunas em tablet
- 1 coluna em mobile
- Gap: 16px

## DataTable

Para Transações, Contas, Cartões, Categorias, Tags, etc.

```
┌──────────────────────────────────────┐
│ [checkbox]│ Col1 │ Col2 │ Col3 │ ... │ [Ações]
├──────────────────────────────────────┤
│ [X]      │ ...  │ ...  │ ...  │ ... │ [✎][🗑]
│ [ ]      │ ...  │ ...  │ ...  │ ... │ [✎][🗑]
└──────────────────────────────────────┘
```

**Estrutura:**
- `<table>` com `border-collapse: collapse`
- `<thead>` com background --pf-bg
- `<tbody>` com `border-top` em cada linha 1px --pf-border

**Header de coluna:**
- Padding: 11px 16px
- Font: 11px weight 800 --pf-muted, text-transform uppercase, letter-spacing 0.05em
- Text-align: left ou right conforme a coluna

**Linhas:**
- Padding: 12px 16px
- Font: 13.5px weight 600
- Hover: background --pf-bg leve
- Transição: background 100ms

**Ações por linha:**
- 28×28px botões icon-only (edit, delete)
- Raio: 7px
- Border: 1px --pf-border
- Background: transparent
- Hover: border --pf-primary, color --pf-text (edit) ou --pf-on-danger (delete)

**Seleção múltipla:**
- Checkbox 18×18px, raio 5px
- Marcado: background --pf-primary, check branco

**Paginação:**
- Apenas em `/transactions` (única tela com >1000 linhas potenciais)
- Estilo: controles na base da tabela (< | 1 de N | >)

## FormModal / FormDrawer

**Desktop:** Modal centralizado, width max 500px, 600px com muito conteúdo.  
**Mobile:** Drawer (sheet) lateral ou de baixo, width 100%, height auto + scroll.

**Estrutura:**
- Header: título + ícone close (X)
- Body: campos empilhados, scrollável se necessário
- Footer: botões "Cancelar" (outline) e "Salvar" (primary), width 100%

**Campo genérico:**
- Label: 13px weight 700, acima do input
- Input: 42–44px altura, padding 12px, raio 10px, border 1px --pf-border, background --pf-input
- Erro: texto em --pf-on-danger 12px weight 600, apareça sob o campo se validação falhar
- Foco: border --pf-primary, box-shadow 0 0 0 3px color-mix(--pf-primary 28%, transparent)

**CurrencyInput:**
- Máscara em tempo real: "R$ x.xxx,00"
- Apenas dígitos internamente
- Ícone R$ à esquerda (opcional)
- Font: JetBrains Mono 13px

**Select/EntitySelect:**
- Trigger: 40px altura, padding 0 12px, estilo input padrão
- Dropdown: bg --pf-elevated, border 1px --pf-border, raio 10px, max-height 300px overflow-y auto
- Opções: 36px altura, padding 9px 10px, hover background --pf-s2
- Busca interna (se >10 itens): campo de busca no topo do dropdown
- Navegação teclado: ↑/↓ move seleção, Enter confirma, Esc fecha

**Switch:**
- Trilho: 42×24px, raio 99px
- Thumb: 18×18px, branco, transição transform 180ms
- Ligado: trilho bg --pf-primary, thumb translateX(18px)
- Desligado: trilho bg --pf-s2, thumb translateX(0)

## Badge / Chip

**Status tipo transação:**
- Receita: badge verde, texto branco, "Receita"
- Despesa: badge vermelho, texto branco, "Despesa"
- Transferência: badge ciano, texto ciano claro, "Transferência"
- Parcelamento: badge laranja (acento), texto branco, "4/10" (exemplo)

**Estilo:**
- Height: 18–22px
- Padding: 0 8–10px
- Border-radius: 999px
- Font: 10.5–11px weight 700
- Inline-flex align-items center gap 6px

**Badge de status (lido/novo):**
- Background: --pf-s2 para normal
- Color: --pf-muted weight 700
- Para "Novo": bg color-mix(--pf-danger 15%, transparent), color --pf-on-danger weight 800

## Gráfico (Chart Wrapper)

```
┌──────────────────────────────┐
│ Título    [legenda inline]   │
├──────────────────────────────┤
│                              │
│         [SVG / Canvas]       │
│                              │
│ [labels eixo X]              │
└──────────────────────────────┘
```

**Estrutura:**
- Raio: 16px, border 1px --pf-border, background --pf-surface, box-shadow var(--pf-shadow)
- Padding: 15px 18px (header), 18px (conteúdo)
- Header: border-bottom 1px --pf-border, font 14px weight 800

**SVG:**
- Responsive: viewBox ajustado, preserveAspectRatio="none" para linhas/barras fluidas
- Grid lines: stroke 1px --pf-border
- Cores por tipo:
  - Receitas (line): --pf-on-success
  - Despesas (line): --pf-on-danger
  - Categorias (donut/pizza): cores diferentes por categoria (accent, primary, warning, success)
  - Patrimônio: --pf-on-asset
- Legenda: inline no header ou abaixo do gráfico, gap 12px, font 11.5px weight 700

**Estados:**
- Loading: skeleton em formato do gráfico (retângulo cinza pulsante)
- Empty: texto central 13px --pf-muted "Nenhum dado disponível para este período."

## EmptyState

```
┌──────────────────────────────┐
│         [ícone grande]       │
│                              │
│    "Nenhuma transação..."     │
│    "...encontrada."           │
│                              │
│  [ + Criar primeira ]          │
└──────────────────────────────┘
```

**Estilo:**
- Border-radius: 16px
- Border: 1px dashed --pf-border
- Background: transparent
- Padding: 40–60px
- Display: flex, flex-direction column, align-items center, gap 12px
- Min-height: 240–300px

**Conteúdo:**
- Ícone: 48×48px em quadrado com raio 11px, fundo color-mix(cor 16%, transparent)
- Título: 16px weight 800
- Descrição: 13px --pf-muted weight 500
- CTA button: height 36px, padding 0 16px, raio 10px, bg --pf-accent, color branco

## Toast / Notificação

```
         ┌─────────────────────────┐
         │ ✔ Transação salva      [×]│
         └─────────────────────────┘
```

**Posição:** fixo bottom-right, margin 16px
**Dimensões:** width max-width 360px, min-width 240px, height auto padding 12px 16px

**Estilo:**
- Border-radius: 10px
- Background: --pf-elevated
- Border: 1px --pf-border
- Box-shadow: var(--pf-shadow)
- Display: flex align-items center gap 12px

**Conteúdo:**
- Ícone (opcional): 16×16px (checkmark, X, info)
- Mensagem: 13px weight 600
- Botão close: X, 14×14px
- Auto-close: 4–6 segundos

**Stack:** múltiplos toasts empilham com gap 8px

---

# Telas Principais

## Login (`/login`)

**Fora do shell**, página standalone.

```
┌────────────────────────────────────┐
│                                    │
│       ┌──────────────────────┐    │
│       │  [Logo/Marca]        │    │
│       │                      │    │
│       │ Email                │    │
│       │ [______________]     │    │
│       │                      │    │
│       │ Senha                │    │
│       │ [______________] [👁]│    │
│       │                      │    │
│       │   [Entrar]           │    │
│       └──────────────────────┘    │
│                                    │
└────────────────────────────────────┘
```

**Card centralizado:**
- Max-width: 400px
- Padding: 32px
- Raio: 16px

**Campos:**
- Email: input padrão 40px altura, placeholder "seu@email.com", obrigatório
- Senha: input 40px, placeholder "••••••••", toggle mostrar/ocultar (ícone olho)
- Botão "Entrar": 40px, full-width, bg --pf-primary, spinner inline se loading

**Estados:**
- Erro: mensagem em --pf-on-danger 12px weight 600 centralizada acima do botão
  - "Credenciais inválidas ou muitas tentativas. Tente novamente em instantes."
- Loading: botão desabilitado, campos desabilitados, spinner

**Comportamento:**
- Enter em qualquer campo submete
- Foco automático em email ao carregar
- Redirect para `/dashboard` se autenticado

---

## Dashboard (`/dashboard`)

**Estrutura:**

1. **Ações rápidas** (flex wrap gap 10px)
   - 6 botões: "+ Nova receita", "+ Nova despesa", "+ Transferência", "+ Novo cartão", "+ Nova conta", "+ Novo parcelamento"
   - Estilos:
     - "+ Nova receita": success (green)
     - "+ Nova despesa": danger (red)
     - "+ Transferência": transfer (ciano)
     - "+ Novo cartão", "+ Nova conta", "+ Novo parcelamento": accent (laranja)
   - Botões com ícone à esquerda, 40px altura, padding 0 14px

2. **Resumo semanal** (box completo, card grande)
   ```
   ┌─────────────────────────────────────────────┐
   │ 📅 RESUMO SEMANAL          30/06 – 06/07    │
   ├─────────────────────────────────────────────┤
   │ Receitas     R$ 2.100,00  ↑ 4% vs. semana  │
   │ Despesas     R$ 1.340,00  ↓ 8% vs. semana  │
   │ Saldo        + R$ 760,00                    │
   │ Média diária  R$ 191,42                     │
   │                                              │
   │ 18 transações · Maior dia: sáb R$ 420       │
   │                                              │
   │ TOP CATEGORIAS DA SEMANA                     │
   │ ● Mercado      ████████░░ 40%  R$ 480,00   │
   │ ● Transporte   ███░░░░░░░ 15%  R$ 180,00   │
   │ ● Lazer        █████░░░░░░ 25%  R$ 300,00  │
   └─────────────────────────────────────────────┘
   ```
   - Visível apenas: domingo 00:00 → segunda 14:00 (America/Sao_Paulo)
   - Fora dessa janela, não renderiza o box

3. **Alertas ativos** (3–5 cards, flex column)
   - Cada um: card com ícone tint, tipo (Atenção/Crítico/No verde), título, descrição, data
   - Clique marca como lido (desaparece da view)
   - Estilo ícone tint: 38×38px, raio 11px, bg color-mix(cor 16%, transparent)

4. **KPI Grid** (3 colunas, gap 16px)
   ```
   ┌──────────┬──────────┬──────────┐
   │ Saldo    │ Receitas │ Despesas │
   │ R$5.2k   │ R$8.4k   │ R$1.3k   │
   │ +15% vs  │ +12% vs  │ -8% vs   │
   └──────────┴──────────┴──────────┘
   ┌──────────┬──────────┬──────────┐
   │ A Pagar  │ Resultado│ Patrimô. │
   │ R$920    │ +R$7.1k  │ R$45.2k  │
   │ 5 contas │ do mês   │ Total    │
   └──────────┴──────────┴──────────┘
   ```
   - Cada card: 160px altura aprox., ícone + título + valor (mono, grande) + variação

5. **Cartões e dívidas** (grid 2 colunas, gap 16px)
   - Cards de cartão com barra de progresso horizontal (limite usado/total)
   - Card "Nova conta": empty state dashed, "[ + Nova conta ]"

6. **Parcelamentos ativos** (grid 2 colunas, gap 16px)
   - Cada parcelamento: barra de progresso vertical de parcelas, valor pago/restante
   - Card "Novo parcelamento": empty state dashed

7. **Gráficos** (grid 2 colunas, gap 16px)
   - Esquerda: Donut "Gastos por categoria" (legenda inline direita)
   - Direita: Linha "Evolução mensal" (receita vs despesa, 7 últimos meses)

8. **Últimas 5 transações** (DataTable compacta)
   - Sem paginação, apenas preview
   - Colunas: Descrição (com badge tipo), Categoria, Conta/Cartão, Data, Valor
   - Link "Ver todas" vai para `/transactions`

---

## Transações (`/transactions`)

**Barra de filtros:**
- Input busca: 220–340px min-max
- Dropdowns: Tipo, Categoria, Conta/Cartão, Período (azul ativo)
- Chips adicionais: Tag, isPaid (pago/pendente)
- Todos com ícone dropdown (seta)

**DataTable:**
- Checkbox header (selecionar todos) + linha de cada transação
- Colunas: Data, Descrição, Categoria, Conta/Cartão, Tipo (badge), Valor (mono, cor por tipo), Ações (editar, excluir)
- Descrição com badge opcional (parcelamento "4/10", transferência "Transfer")
- Paginação: página N de M, botões <, >, ir para página

**Estados por linha:**
- Hover: background --pf-bg leve
- Seleção: checkbox marcado, linha tint leve

---

## Contas (`/accounts`)

**Grid de cards:**
```
┌─────────────┬─────────────┬─────────────┐
│ Corrente    │ Poupança    │ + Nova      │
│ R$ 5.200    │ R$ 12.000   │   Conta     │
│ +R$800 mês  │ +R$2.3k     │             │
└─────────────┴─────────────┴─────────────┘
```

- Cada card: nome, saldo (mono grande), variação (pequena)
- Clique abre detalhe (drill-down ou painel lateral)
- Card "+ Nova conta": empty state dashed, "[ + Nova Conta ]"

**Detalhe de conta (se sidebar ou modal):**
- Saldo atual, saldo inicial, histórico de transações (DataTable filtrada)
- Gráfico de entradas/saídas do mês
- Botão "Transferir" abre formulário (origem, destino, valor, data)

---

## Cartões (`/cards`)

**Grid de cards:**
```
┌──────────────────┬──────────────────┐
│ Nubank           │ XP Visa          │
│ ████████░░ 78%   │ ███░░░░░░░ 30%   │
│ R$3.2k/R$4k      │ R$600/R$2k       │
│ Dispo: R$800     │ Dispo: R$1.4k    │
└──────────────────┴──────────────────┘
```

- Clique abre detalhe do cartão

**Detalhe:**
- Limite total, usado, disponível
- Fatura atual com botão "Pagar fatura"
- Compras da fatura atual (DataTable, sem paginação)
- Parcelamentos deste cartão (grid compacto, reaproveitando componente)
- Histórico de faturas passadas (lista simples: mês, total)

---

## Parcelamentos (`/installments`)

**Cards de compra parcelada:**
```
┌────────────────────────────────────┐
│ MacBook Pro                         │
│ ████░░░░░░ 4/10  R$5.9k pago       │
│ Restante: R$8.9k · Nubank          │
│ [ + Parcela ] [ Detalhes ]         │
└────────────────────────────────────┘
```

- Cada card: nome, barra de progresso, valores derivados, cartão
- Sem paginação (lista completa)
- Clique em "Detalhes" abre lista de N parcelas (todas, com datas e status)

---

## Orçamentos (`/budgets`)

**Cards por categoria:**
```
┌──────────────────────────────────────┐
│ Alimentação                           │
│ R$ 1.200 / R$ 1.500  ████████░░ 80% │
│ Restante: R$ 300                     │
└──────────────────────────────────────┘
```

- Barra com 3 estados: normal (0–80%, azul), atenção (80–100%, laranja), estourado (>100%, vermelho)
- Seletor Mês/Ano no topo (mês atual por default)
- Sem paginação

---

## Patrimônio (`/assets`)

**Gráficos:**
- Linha: evolução do patrimônio total (últimos 12 meses)
- Donut: composição (Imóveis, Investimentos, FGTS, Reserva, etc.)

**Cards agrupados por tipo:**
```
IMÓVEIS
  [ Casa em SP   R$ 450k  +0.5% ]
  [ Apartamento  R$ 280k  -2%   ]

INVESTIMENTOS
  [ Tesouro Direto R$ 85k  +3%   ]
  [ CDB           R$ 32k  +1.2% ]

RESERVA
  [ Poupança      R$ 15k  +0.8% ]
```

- Cada card: nome, valor, variação
- Clique abre histórico de snapshots (gráfico de evolução daquele ativo)

---

## Relatórios (`/reports`)

**Filtros globais no topo:**
- Período, Categoria, Tags, Conta, Cartão, Tipo
- Aplicam-se a todos os relatórios abaixo

**Relatórios (em abas ou seções):**
1. **Categorias** — barra horizontal por categoria
2. **Tags** — barra horizontal por tag
3. **Fluxo de caixa** — linha (receita vs despesa, últimos 12 meses)
4. **Por conta** — tabela (nome, entradas, saídas, saldo)
5. **Por cartão** — tabela (nome, compras, limite disponível)
6. **Parcelamentos** — tabela (compra, cartão, progresso, valor restante)
7. **Orçamento vs realizado** — tabela (categoria, planejado, realizado, %)
8. **Patrimônio** — linha (evolução total, últimos 12 meses)

**Botão "Exportar CSV"** no header — Server Action que gera CSV das transações filtradas

---

## Alertas (`/alerts`)

**Filtros:**
- Tipo: Todos, Atenção, Crítico, Verde, Resumo
- Status: Todos, Lido, Não lido

**Cards de alerta:**
- Cada um: ícone tint, tipo, título, descrição, data, badge de status (Lido/Novo)
- Clique marca como lido (desaparece se filtro está em "Não lido")
- Sem paginação (histórico completo)

---

## Configurações (`/settings`)

**Seções (cada uma um card):**

1. **Perfil**
   - Avatar (56×56px), nome, email, telefone, membro desde, status ativo
   - Botão "Editar" abre formulário inline ou modal

2. **Preferências gerais**
   - Moeda: "Real brasileiro · sem multi-moeda" (read-only, sempre BRL)
   - Timezone: "America/Sao_Paulo" (read-only, fixo)
   - Tema: radio buttons (Claro, Escuro, Sistema) — aplica imediatamente

3. **Alertas**
   - 3 sliders/inputs:
     - Multiplicador anomalia (threshold Atenção): 1.5
     - Mínimo absoluto: R$ 50 (CurrencyInput)
     - Multiplicador verde: 0.6
   - Texto explicativo dinâmico: "Atenção quando gastos > 1.5x da média"

4. **Telegram**
   - Status: "Vinculado" (verde) ou "Não vinculado" (cinza)
   - Se vinculado: display read-only de `chat_id`
   - Checkboxes:
     - [ ] Receber resumo semanal
     - [ ] Receber alertas de atenção
     - [ ] Receber alertas verdes
   - Se não vinculado: texto "Procure o administrador para vincular seu Telegram"

5. **Dados**
   - Botão "Exportar transações (CSV)" — Server Action
   - Botão "Ver informações de backup" — abre painel modal com texto sobre PITR e data do último dump (read-only)
   - Botão "Fazer backup manual" (se aplicável)

6. **Sessão**
   - Botão "Sair" (logout) — red/danger color

**Comportamento:**
- Cada seção salva independentemente (submit por seção)
- Feedback: toast "Configurações atualizadas."
- Sem reload de página

---

# Responsividade

## Breakpoints

- **Mobile:** 375–599px (padrão: 375px, 400px, 480px)
- **Tablet:** 600–1279px (padrão: 768px, 900px)
- **Desktop:** 1280px+ (padrão: 1280px, 1920px)

## Mudanças por breakpoint

| Componente | Desktop | Tablet | Mobile |
|---|---|---|---|
| Sidebar | 248px fixo | (desaparece) | (desaparece) |
| Bottom Nav | (não existe) | Sim, 48px | Sim, 64px |
| Header | Flex row | Flex row | Flex column (compacto) |
| KPI Grid | 3 col | 2 col | 1 col |
| Card Grid | 2 col | 1 col | 1 col |
| Gráficos | 2 col lado-a-lado | 1 col | 1 col |
| DataTable | Linhas/colunas | Cards empilhados | Cards empilhados |
| Filtros | Linha inline | Drawer/collapse | Drawer/collapse |
| Modal | Centralizado 500px | 90vw | Full-width drawer |

## Mobile specifics

- Sem horizontal scroll (nunca)
- Padding reduzido: 12–16px laterais
- Fonts: 1–2px menores
- Ícones: 20–24px (em vez de 24–28px)
- Densidade: cards menores, gaps reduzidos

---

# Animações e Transições

**Recomendações** (usar Framer Motion ou CSS vanilla conforme preferência):

| Ação | Tipo | Duração | Easing |
|---|---|---|---|
| Sidebar colapso | slide + resize | 200ms | ease-in-out |
| Modal/Drawer abertura | fade + slide | 220ms | ease-out |
| Hover botão | scale micro | 100ms | ease-out |
| Hover card | sombra + leve lift | 150ms | ease-out |
| Valor de KPI muda | número tween | 600ms | ease-inout |
| Toast entra | slide-in from bottom-right | 220ms | ease-out |
| Toast sai | fade + slide | 200ms | ease-in |
| Página/seção entra | fade + slide up 12px | 200ms | ease-out |

**Respectar `prefers-reduced-motion`** — desabilitar animações se usuário preferir.

---

# Acessibilidade

- Toda navegação via Sidebar/Bottom Nav navegável por Tab
- Command Palette (`Ctrl+K`) alcançável de qualquer tela
- Todos os atalhos (`Ctrl+N`, `G+D`, etc.) globais
- Foco visível em toda a aplicação
- Cores nunca como único indicador (texto + ícone + cor)
- `aria-label` em botões icon-only
- Labels explícitos em formulários
- Confirmação em ações destrutivas (não enter automático)

---

# Padrões de Dados

## Moeda

- **Sempre** em BRL, formatada: `R$ x.xxx,00` (JetBrains Mono)
- Negativo: `- R$ xxx,00` ou `(R$ xxx,00)` conforme contexto
- Transações: cor por tipo (verde receita, vermelho despesa, ciano transfer)

## Data

- **Formato:** DD/MM/YYYY (PT-BR) em inputs, leitura "06 de julho de 2026"
- **Timezone:** America/Sao_Paulo (nunca UTC puro exibido)
- **Hoje:** sempre "hoje" ou timestamp "06/07" dependendo contexto

## Status

- **Transação:** pago (True/False) → badge ou indicador visual
- **Parcelamento:** progresso (N/M) → badge "4/10"
- **Alerta:** lido (True/False) → badge "Lido" ou "Novo"
- **Orçamento:** estourado (bool) → cor barra (verde/amarelo/vermelho)

---

# Próximos passos para implementação

1. **Setup Next.js 14+** com App Router, TypeScript, Tailwind (ou CSS modules)
2. **Instalar dependências:** Framer Motion (animações), Lucide React (ícones), Day.js ou date-fns (datas), clsx/classnames
3. **Criar structure:** `/app/layout.tsx` (shell), `/app/auth/login/page.tsx`, `/app/(app)/...` (rotas autenticadas)
4. **Implementar componentes base:** Button, Card, Input, Select, Modal, Drawer, Toast, DataTable
5. **Adicionar rotas:** dashboard, transactions, accounts, cards, etc. — uma por sprint
6. **Conectar à API/backend:** Server Actions ou fetch para dados
7. **Implementar autenticação:** Auth.js ou similar (Credentials provider)
8. **Tema:** context + localStorage para Light/Dark
9. **Mobile:** respuestas CSS Media Queries ou Tailwind responsive prefixes

---

# Referência rápida de links

- **Design System:** `/Personal Finance Design System.dc.html`
- **Wireframe funcional:** `/Personal Finance App.dc.html`
- **Documentos specs:** `/docs/*` (repo cheeenrique/personal-finance)

