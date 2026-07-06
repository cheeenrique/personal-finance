# Personal Finance — Design System Handoff

Referência visual viva: **`Personal Finance Design System.dc.html`** (abra no navegador — demonstração interativa de todos os componentes, tokens e temas).

---

# Identidade Visual

## Logo e Marca

**Nome:** Personal Finance  
**Símbolo:** Gráfico ascendente (Lucide `TrendingUp`) em laranja escuro (`--pf-accent: #EA580C`), dentro de um quadrado com gradiente azul-para-mais-escuro (background `linear-gradient(135deg, #1E40AF 0%, #0F2A5F 100%)`, raio `9px`).

**Aplicação:**
- Sidebar: quadrado 38×38px, topo esquerdo
- Favicon: SVG com fundo azul, símbolo laranja
- Splash screens: versão grande 64–128px
- Documentos: pequena 24px, alinhada em headers

---

# Paleta de Cores

## Core (Tema Escuro — Default)

```css
:root {
  /* Backgrounds */
  --pf-bg: #0B1223;                    /* Navy escuro, fundo principal */
  --pf-surface: #141D30;               /* Cards, superfícies primárias */
  --pf-elevated: #1A2438;              /* Popovers, modals, dropdowns */
  --pf-s2: #1F2A40;                    /* Superfícies secundárias, trilhos */
  
  /* Borders e Dividers */
  --pf-border: #28344C;                /* Linha 1px em cards, inputs */
  
  /* Inputs e Backgrounds Leves */
  --pf-input: rgba(255, 255, 255, 0.03);
  
  /* Text */
  --pf-text: #F1F5F9;                  /* Texto principal, em branco */
  --pf-muted: #93A2B8;                 /* Texto secundário, sutileza */
}
```

## Accents & Semantic (ambos os temas)

```css
/* Primary — Navegação, ações primárias */
--pf-primary: #1E40AF;                 /* Azul escuro (conforme LocaHub) */
--pf-primary-fg: #ffffff;              /* Texto/ícone em botões primary */
--pf-on-primary: #8FABFF;              /* Variante mais clara para badges */

/* Accent — CTAs, ações destacadas */
--pf-accent: #EA580C;                  /* Laranja escuro */
--pf-accent-fg: #0B1223;               /* Texto em fundo laranja = navy */

/* Sucesso — Receitas, valores positivos, check */
--pf-success: #16A34A;                 /* Verde sábia */
--pf-on-success: #4ADE80;              /* Verde clara (badges) */

/* Warning — Atenção, limites próximos */
--pf-warning: #F59E0B;                 /* Amarelo/laranja */
--pf-on-warning: #FBBF24;              /* Mais claro para badges */

/* Danger — Crítico, despesa, delete, erro */
--pf-danger: #EF4444;                  /* Vermelho */
--pf-on-danger: #F87171;               /* Vermelho claro (badges) */

/* Transfer — Transferências bancárias */
--pf-transfer: #38BDF8;                /* Ciano/azul-claro */
--pf-on-transfer: #7DD3FC;             /* Mais claro */

/* Asset — Patrimônio, investimentos */
--pf-asset: #A855F7;                   /* Roxo */
--pf-on-asset: #C99DF6;                /* Roxo claro */

/* Shadow */
--pf-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);

/* Header backdrop */
--pf-header: rgba(11, 18, 35, 0.82);
```

## Tema Claro

Quando `data-theme="light"`:

```css
:root[data-theme="light"] {
  --pf-bg: #FFFFFF;
  --pf-surface: #F8FAFC;
  --pf-elevated: #F1F5F9;
  --pf-s2: #E2E8F0;
  --pf-border: #CBD5E1;
  --pf-input: rgba(0, 0, 0, 0.04);
  
  --pf-text: #0B1223;
  --pf-muted: #64748B;
  
  --pf-primary: #2563EB;               /* Azul um tom mais claro */
  --pf-header: rgba(255, 255, 255, 0.92);
  
  /* Accents mantêm saturação, apenas ajustados para legibilidade */
  --pf-accent: #D97316;                /* Laranja um tom mais claro */
  --pf-success: #22C55E;               /* Verde */
  --pf-warning: #FBBF24;               /* Amarelo mais claro */
  --pf-danger: #F87171;                /* Vermelho */
  --pf-transfer: #06B6D4;              /* Ciano */
  --pf-asset: #D946EF;                 /* Roxo */
}
```

## Aplicação de Cores por Componente

| Componente | Cor | Uso |
|---|---|---|
| **Botão Primary** | --pf-primary | Ações principais, envios de form |
| **Botão Accent** | --pf-accent | CTAs secundárias, "+ Nova Transação" |
| **Botão Danger** | --pf-danger | Delete, logout, ações destrutivas |
| **Badge Receita** | --pf-success bg, --pf-text fg | Transações positivas |
| **Badge Despesa** | --pf-danger bg, white fg | Transações negativas |
| **Badge Transfer** | --pf-transfer bg, white fg | Transferências entre contas |
| **Badge Parcelamento** | --pf-accent bg, white fg | "4/10" badges |
| **Alerta Atenção** | --pf-warning bg, #000 fg | Limites próximos |
| **Alerta Crítico** | --pf-danger bg, white fg | Orçamento estourado |
| **Alerta Verde** | --pf-success bg, white fg | Metas atingidas |
| **KPI Receita** | --pf-success ícone bg, --pf-on-success ícone | Card de receita |
| **KPI Despesa** | --pf-danger ícone bg, --pf-on-danger ícone | Card de despesa |
| **KPI Patrimônio** | --pf-asset ícone bg, --pf-on-asset ícone | Card de patrimônio |
| **Link** | --pf-primary | Navegação inline |
| **Focus ring** | --pf-primary 28% opacity | Keyboard focus visual |
| **Border padrão** | --pf-border | Cards, inputs, linhas |

---

# Tipografia

## Font Stack

```css
body {
  font-family: "Nunito", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* Para números e valores de moeda */
[data-mono],
.mono,
.currency,
.code {
  font-family: "JetBrains Mono", "Courier New", monospace;
}
```

## Scale & Weights

### Headings (Nunito)

| Uso | Size | Weight | Line-height | Letter-spacing |
|---|---|---|---|---|
| H1 / Display | 52px | 900 | 1.0 | -0.03em |
| H2 / Section | 38px | 900 | 1.1 | -0.02em |
| H3 / Título Card | 20px | 800 | 1.2 | -0.01em |
| H4 / Eyebrow | 12px | 800 | 1.2 | 0.16em (UPPERCASE) |

### Body (Nunito)

| Uso | Size | Weight | Line-height |
|---|---|---|---|
| Body L | 18px | 500 | 1.5 |
| Body | 16px | 500 | 1.5 |
| Body S | 14px | 500 | 1.5 |
| Caption | 13px | 500 | 1.4 |
| Label | 13px | 700 | 1.4 |
| Overline | 11px | 800 | 1.2 |

### Data/Currency (JetBrains Mono)

| Uso | Size | Weight | Line-height |
|---|---|---|---|
| Value Large | 28px | 600 | 1.0 |
| Value | 24px | 600 | 1.0 |
| Value S | 16px | 500 | 1.0 |
| Code | 12px | 500 | 1.3 |

## Exemplos de Aplicação

**Dashboard KPI:**
```
Saldo             ← 13px weight 700 --pf-muted (label)
R$ 5.240,00       ← 28px weight 600 JetBrains Mono (value, --pf-text)
+15% vs. mês      ← 12px weight 600 --pf-muted (variation)
```

**Card de transação:**
```
Supermercado      ← 14px weight 600 --pf-text
Mercado · 06/07   ← 12px weight 500 --pf-muted
-R$ 145,32        ← 14px weight 600 --pf-on-danger (expense)
```

**Seção de página:**
```
Últimas transações ← 20px weight 800 --pf-text (H3)
```

---

# Espaçamento & Layout Grid

## Base Unit

**4px** é a unidade base (LocaHub-style).

## Escala Padrão

```
4px, 8px, 12px, 16px, 20px, 24px, 28px, 32px, 36px, 40px, 
48px, 56px, 64px, 72px, 80px, 96px, 120px, 160px
```

## Aplicações Comuns

| Elemento | Padding/Gap |
|---|---|
| Button (M) | 12px vertical, 16px horizontal |
| Button (S) | 8px vertical, 12px horizontal |
| Input | 12px |
| Card | 16–20px |
| Card header | 16px (com border-bottom) |
| Sidebar | 12px gap itens, 16px padding lateral |
| Header | 14px vertical, 28px horizontal |
| Page container | 16–32px padding (resp.) |
| Grid gap (cards) | 16px |
| List gap | 8px (compact) a 12px (relaxado) |

---

# Componentes Base

## Button

**Variantes:**

### Primary
- Background: --pf-primary
- Foreground: --pf-primary-fg (branco)
- Hover: background color-mix(--pf-primary 80%) (ligeiramente mais escuro)
- Focus: box-shadow 0 0 0 3px color-mix(--pf-primary 28%, transparent)
- Disabled: opacity 0.5, cursor not-allowed
- Tamanhos: S (8px v, 12px h), M (12px v, 16px h), L (16px v, 20px h)
- Height: 32px (S), 40px (M), 48px (L)

### Secondary / Outline
- Background: transparent
- Border: 1px --pf-border
- Foreground: --pf-text
- Hover: background --pf-s2
- Mesmo focus, disabled logic

### Accent
- Background: --pf-accent
- Foreground: --pf-accent-fg
- Hover: color-mix(--pf-accent 90%)
- Focus: --pf-accent tint

### Danger
- Background: --pf-danger
- Foreground: white
- Hover: color-mix(--pf-danger 90%)
- **Confirmação:** sempre com dialog de confirmação antes de executar

### Icon-only
- 36×36px, 40×40px, 48×48px (conforme tamanho)
- Padding: 0
- Display: flex, align-items center, justify-content center
- Ícone: 16×16px a 24×24px

### Disabled State (Universal)
```css
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
```

## Input / TextField

- Height: 40–44px (padrão 40px)
- Padding: 12px (horizontal)
- Border: 1px --pf-border
- Border-radius: 10px
- Background: --pf-input
- Font: 14px weight 500
- Placeholder: --pf-muted weight 500
- Focus: border --pf-primary, box-shadow 0 0 0 3px color-mix(--pf-primary 28%, transparent)
- Error state: border --pf-danger, error text 12px weight 600 --pf-on-danger abaixo

**Variantes:**
- **Text:** padrão
- **Email:** type="email"
- **Password:** type="password" com toggle olho
- **Number:** type="number", step conforme campo
- **Currency:** input com máscara "R$ x.xxx,00" (JetBrains Mono, internamente só números)
- **Textarea:** min-height 96px, resize vertical
- **Search:** com ícone lupa à esquerda

## Select / Combobox

- Trigger: 40px height, padding 0 12px, estilo input padrão, ícone chevron-down à direita
- Dropdown: bg --pf-elevated, border 1px --pf-border, raio 10px, max-height 300px overflow-y auto, z-index 50
- Opção: 36px altura, padding 9px 10px, hover background --pf-s2, active bg --pf-primary, text branco ativo
- Busca (se >10 itens): input no topo do dropdown, placeholder "Buscar…"
- Navegação: ↑/↓ navega, Enter confirma, Esc fecha
- Foco: mesmo focus ring que input

## Switch / Toggle

- Trilho: 42×24px, raio 99px, background --pf-s2 (off) ou --pf-primary (on)
- Thumb: 18×18px, branco, raio 99px, sombra 0 1px 3px rgba(0,0,0,0.15)
- Transição: transform 180ms ease-out
- Estados: off (translateX 0), on (translateX 18px)
- Foco: outline 2px --pf-primary com offset 2px

## Badge / Pill

- Height: 20–24px
- Padding: 0 10px
- Border-radius: 999px
- Font: 11px weight 700
- Cores: inherit conforme semantic (success, danger, warning, etc.)
- Inline-flex, align-items center, gap 6px (para ícone)

**Variantes:**
- **Status:** verde (ativo), cinza (inativo), vermelho (alerta)
- **Categoria:** cores por categoria (predefinido ou customizável)
- **Tag:** pequena, com X para remover
- **Parcelamento:** "N/M" laranja escuro

## Checkbox

- Size: 18×18px
- Raio: 5px
- Border: 1px --pf-border (unchecked), 2px --pf-primary (checked)
- Background: --pf-bg (unchecked), --pf-primary (checked)
- Check: SVG branco, 12×12px
- Label: à direita, 14px weight 500, cursor pointer
- Foco: box-shadow --pf-primary com offset 2px

## Radio

- Size: 18×18px (outer circle)
- Border: 2px --pf-border (unchecked), 2px --pf-primary (checked)
- Inner dot: 8×8px --pf-primary (checked only)
- Label: à direita, 14px weight 500
- Foco: outline 2px --pf-primary offset 2px

## Chips / Segmented Control (2–3 opções)

**Para < 16 chars por label:**
```
┌─────────┬─────────┬─────────┐
│ Claro   │ Escuro  │ Sistema │
└─────────┴─────────┴─────────┘
```

- Cada opção: flex 1, height 36px, border 1px --pf-border (inactive), text 13px weight 700
- **Active:** background --pf-primary, color white, border --pf-primary
- **Inactive:** background transparent, color --pf-text
- Container: display flex, gap 0, raio 10px (outer), border 1px --pf-border (outer)
- Transição: background 100ms ease-out

---

# Componentes Compostos

## Card

```
┌───────────────────────────┐
│ Título       [ação]       │ ← Header 16px, border-bottom
├───────────────────────────┤
│ Conteúdo                  │ ← Padding 18px
│                           │
└───────────────────────────┘
```

- Border: 1px --pf-border
- Background: --pf-surface
- Border-radius: 16px
- Box-shadow: var(--pf-shadow)
- Padding: 18px (padrão), 16px em layouts densos
- Header (se houver): padding 16px, border-bottom 1px --pf-border, font 14px weight 800
- Hover (opcional): sombra intensifica, background levemente mais clara

## KPICard

```
┌─────────────────────────┐
│ [ícone] Saldo           │
│                         │
│    R$ 5.240,00         │
│    +15% vs. mês        │
└─────────────────────────┘
```

- Estilo card padrão, height 160–180px
- Ícone: 30×30px em quadrado raio 10px, background color-mix(cor 16%, transparent), ícone na cor on-*
- Título: 13px weight 700 --pf-muted, margin-bottom 2px
- Valor: JetBrains Mono, 24–28px weight 600, --pf-text, margin-top 8px
- Variação (opcional): 12px weight 600, cor por estado (+verde, -vermelho, neutro --pf-muted)
- Flexbox column, gap 12px

## DataTable

```
┌─────────┬────────────────┬────────────┬──────────┐
│ [✓]     │ Descrição      │ Categoria  │ Valor    │
├─────────┼────────────────┼────────────┼──────────┤
│ [ ]     │ Supermercado   │ Alimentação│ -R$145   │
│ [ ]     │ Uber           │ Transporte │ -R$28    │
└─────────┴────────────────┴────────────┴──────────┘
```

- `<table>` border-collapse collapse
- `<thead>`: background --pf-bg, sticky top (se scrollável)
- Header: padding 11px 16px, font 11px weight 800 --pf-muted uppercase, letter-spacing 0.05em, text-align left/right conforme coluna
- `<tbody>` linhas:
  - Padding: 12px 16px
  - Border-top: 1px --pf-border
  - Font: 13.5px weight 600 --pf-text
  - Hover: background --pf-bg leve, transição 100ms
  - **Selecionada:** background color-mix(--pf-primary 12%, transparent)
- Checkbox: 18×18px col primeira, 16px padding
- Ações (últimas cols): 2–3 botões icon-only 28×28px, raio 7px, border 1px --pf-border

**Paginação (se necessário):**
- Base da tabela: flex space-between align-items center, padding 12px 16px
- "N–M de Total" 12px weight 600 --pf-muted
- Botões < / > : 32×32px, raio 7px, border 1px --pf-border

## Modal

```
┌────────────────────────────────┐
│ Título                    [×]  │
├────────────────────────────────┤
│ Conteúdo                       │
│                                │
├────────────────────────────────┤
│   [Cancelar]  [Salvar]         │
└────────────────────────────────┘
```

- Backdrop: rgba(0, 0, 0, 0.5) semi-transparente, display flex, align-items center, justify-content center
- Container: max-width 500px (padrão), 600px com muito conteúdo, raio 18px, background --pf-surface, border 1px --pf-border, box-shadow var(--pf-shadow)
- Header: padding 18px, border-bottom 1px --pf-border, font 18px weight 800, display flex space-between
- Close button (×): 32×32px, raio 7px, background transparent, hover --pf-s2, ícone 16×16px
- Body: padding 18px, overflow-y auto (max-height 60vh)
- Footer: padding 16px, border-top 1px --pf-border, display flex gap 10px justify-end
  - Botão "Cancelar": secondary, 36px
  - Botão "Salvar": primary, 36px
- Animação: fade-in + scale 0.95 → 1.0 em 220ms ease-out

## Drawer (Mobile)

- Position fixed, bottom 0 ou right 0 (dep. layout)
- Width: 100% (bottom) ou 360px–90vw (side)
- Height: auto + scroll (bottom)
- Background: --pf-surface
- Header: 48px, padding 12px, border-bottom 1px --pf-border, título + close button
- Body: padding 16px, overflow-y auto
- Footer: padding 16px, border-top 1px --pf-border, botões CTA
- Animação: slide-in from bottom em 220ms ease-out

## Toast / Notification

```
         ┌──────────────────────────┐
         │ ✔ Transação salva      [×]│
         └──────────────────────────┘
```

- Position: fixed bottom 16px right 16px
- Width: max-width 360px, min-width 240px
- Height: auto
- Background: --pf-elevated
- Border: 1px --pf-border, raio 10px
- Box-shadow: var(--pf-shadow)
- Padding: 12px 16px
- Display: flex align-items center gap 10px
- Ícone (16×16px): checkmark (sucesso), X (erro), info (info), warning (aviso)
- Mensagem: 13px weight 600 --pf-text, flex 1
- Botão close: X 14×14px, hover --pf-muted
- Auto-close: 4s (sucesso), 6s (erro)
- Stack: múltiplos com gap 8px vertical
- Animação: slide-in from bottom-right em 220ms ease-out, fade-out em 200ms ease-in

## EmptyState

```
┌──────────────────────────────┐
│         [ícone]              │
│                              │
│  "Nenhuma transação..."      │
│  "...encontrada neste mês."  │
│                              │
│   [ + Criar primeira ]        │
└──────────────────────────────┘
```

- Border: 1px dashed --pf-border
- Background: transparent
- Border-radius: 16px
- Padding: 40–60px
- Display: flex flex-direction column align-items center gap 12px
- Min-height: 240px (cards) a 360px (páginas)
- Ícone: 48×48px em quadrado raio 11px, background color-mix(cor 16%, transparent), ícone cor semantic
- Título: 16px weight 800 --pf-text, text-align center
- Descrição: 13px weight 500 --pf-muted, text-align center
- CTA button: 36px height, padding 0 16px, raio 10px, primary ou accent

---

# Animações & Motion

## Easing Functions

```
ease-out:    cubic-bezier(0.16, 1, 0.3, 1)         /* Objetos entrando */
ease-in-out: cubic-bezier(0.42, 0, 0.58, 1)        /* State changes */
ease-in:     cubic-bezier(0.7, 0, 0.84, 0.0)       /* Saídas, fade-out */
```

## Timing

| Ação | Duração | Easing |
|---|---|---|
| Hover micro (button scale) | 100ms | ease-out |
| Focus ring, border change | 100ms | ease-out |
| Modal/Drawer open | 220ms | ease-out |
| Toast enter | 220ms | ease-out |
| Toast exit | 200ms | ease-in |
| Page/section transition | 200ms | ease-out |
| Sidebar collapse/expand | 200ms | ease-in-out |
| Card hover (shadow lift) | 150ms | ease-out |
| Number tween (KPI update) | 600ms | ease-in-out |
| Stagger list items | 60–100ms delay entre items | ease-out |

## Implementação

**CSS (prefira para transições simples):**
```css
button {
  transition: background 100ms ease-out, box-shadow 100ms ease-out;
}

button:hover {
  background: color-mix(...);
  box-shadow: 0 4px 12px rgba(...);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}
```

**Framer Motion (componentes React complexos):**
```jsx
import { motion } from "framer-motion";

<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
>
  {/* conteúdo */}
</motion.div>
```

---

# Acessibilidade

## Keyboard Navigation

- **Tab:** navega buttons, inputs, links em ordem natural de DOM
- **Shift+Tab:** volta
- **Enter:** confirma buttons, subs forms, abre dropdowns
- **Space:** toggle switches, checkboxes, abre dropdowns
- **Esc:** fecha modals, dropdowns, drawers
- **↑/↓:** navegação em dropdowns/listas, incrementa/decresce números
- **Home/End:** primeiros/últimos itens em listas

## Focus Management

- **Focus ring:** 2px --pf-primary com offset 2px, visible em tudo
- **Modal:** trap focus (Tab fica dentro do modal)
- **Sidebar:** skip link opcional para main content (hidden until focused)

## ARIA Labels

```html
<!-- Botões icon-only -->
<button aria-label="Fechar">×</button>
<button aria-label="Editar transação">✏</button>

<!-- Inputs -->
<label for="email">Email</label>
<input id="email" />

<!-- Modal -->
<div role="dialog" aria-labelledby="modal-title" aria-describedby="modal-desc">
  <h2 id="modal-title">Título</h2>
  <p id="modal-desc">Descrição</p>
</div>

<!-- DataTable -->
<table role="grid">
  <thead role="presentation">
    <tr>
      <th scope="col">Coluna 1</th>
    </tr>
  </thead>
</table>
```

## Color Contrast

- Text on background: WCAG AA (4.5:1) mínimo
- Small text (< 14px): WCAG AAA (7:1) recomendado
- **Nunca apenas cor:** sempre combinar com ícone, texto ou outro indicador

## Prefers Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

# Responsividade

## Breakpoints

```
Mobile:  375–599px   (frame test: 375px, 480px)
Tablet:  600–1279px  (frame test: 768px, 900px)
Desktop: 1280px+     (frame test: 1280px, 1920px)
```

## Mudanças por Breakpoint

### Sidebar + Navigation

| Breakpoint | Sidebar | Bottom Nav | Header |
|---|---|---|---|
| Desktop | 248px fixo | — | Flex row |
| Tablet | → Hidden | 48px | Flex row compacto |
| Mobile | Hidden | 64px | Flex column (título + busca stacked) |

### Grids e Layouts

| Componente | Desktop | Tablet | Mobile |
|---|---|---|---|
| KPI Grid | 3 col | 2 col | 1 col |
| Card Grid | 2 col | 1 col | 1 col |
| Gráficos | 2 col lado | 1 col | 1 col |
| Tabelas | Linhas | Cards | Cards |
| Filtros | Row inline | Drawer collapse | Drawer collapse |

### Padding & Spacing

| Elemento | Desktop | Tablet | Mobile |
|---|---|---|---|
| Page padding | 24–32px | 16px | 12px |
| Gap cards | 16px | 14px | 12px |
| Button | M (40px) | S (36px) | S (36px) |
| Font size | Base | Base | -1 a -2px |

### Modal / Drawer

| Breakpoint | Comportamento |
|---|---|
| Desktop | Modal centralizado 500px |
| Tablet | Modal 90vw |
| Mobile | Drawer bottom 80vh, full-width |

---

# Componentes Implementados no DS

No arquivo `Personal Finance Design System.dc.html`, encontram-se demos ao vivo:

1. **Buttons** — Primary, Secondary, Accent, Danger, Icon-only, Disabled, Loading
2. **Inputs** — Text, Email, Password (toggle), Number, Currency, Textarea, Search
3. **Select/Combobox** — Com busca, navegação teclado, múltiplas opções
4. **Switch** — On/Off com transição
5. **Checkbox** — Single e grupos
6. **Radio** — Segmented controls (2–3 opções)
7. **Badges** — Status, categoria, transação, parcelamento
8. **Cards** — Padrão, KPI, com header
9. **DataTable** — Exemplo com paginação
10. **Modal** — Exemplo funcional
11. **Toast** — Stack exemplo
12. **EmptyState** — Múltiplas variantes
13. **Gráficos** — Placeholder com estrutura

Cada componente tem:
- Demanda visual lado-a-lado dos dois temas
- Documentação inline de uso
- Tokens CSS var aplicados
- Estados (hover, focus, disabled, loading)

---

# Próximas Fases

## Dev Implementation (Next.js)

1. **Setup:** TypeScript, Tailwind CSS (ou CSS modules), Framer Motion
2. **Component Library:** recriar componentes em React reutilizáveis
3. **Design Tokens:** export tokens do DS como JSON ou Tailwind config
4. **Aplicação:** usar componentes nas 13 telas do layout handoff

## CI/CD & Governance

- Storybook para documentar componentes
- Figma ou design-handed specs para QA
- Testes visuais (Chromatic, Percy) para regressions

---

# Referências Rápidas

| Recurso | Local |
|---|---|
| Design System Visual | `Personal Finance Design System.dc.html` |
| Layout & Wireframe | `Personal Finance App.dc.html` |
| Layout Detalhado | `PERSONAL_FINANCE_LAYOUT_HANDOFF.md` |
| Tokens & Paleta | Este arquivo (`PERSONAL_FINANCE_DS_HANDOFF.md`) |

---

**Versão:** 1.0  
**Data:** 06/07/2026  
**Autor:** Claude (Design)  
**Status:** Final, pronto para dev

