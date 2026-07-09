# Sessão 2026-07-09 — Investimentos, Parcelamentos e Telegram

Data: 2026-07-09  
Status: implementado (commit `b78e380`)  
Docs canônicos: `28-INVESTMENTS.md`, `23-INSTALLMENTS.md`, `30-TELEGRAM.md`, `27-ASSETS.md`, `03-DATABASE.md`, `06-SCREENS.md`

Este documento consolida **tudo o que foi planejado e entregue nesta sessão**,
para não depender só do chat. Detalhe operacional vive nos docs numerados;
aqui ficam decisões, escopo e mapa de arquivos.

---

## 1. Troca de categoria no detalhe do parcelamento

### Problema

Na página Parcelamentos, ao abrir Detalhes, não dava para corrigir a categoria
das parcelas depois da criação.

### Decisões

* `InstallmentPurchase` **não** tem `categoryId` — a categoria vive em cada
  `Transaction` filha (todas iguais na criação).
* Trocar no modal aplica `updateMany` em **todas** as parcelas vivas
  (`deletedAt: null`). Soft-deletadas (cancelamento) ficam intactas.
* UI: `EntitySelect` de categorias EXPENSE + botão “Salvar categoria” só quando
  a seleção difere da atual.

### Entrega

* Domínio: `updateInstallmentPurchaseCategory` + schema/action
* Leitura: `categoryId` / `categoryName` na listagem
* UI: `InstallmentDetailsModal`
* Doc: seção “Troca de categoria” em `23-INSTALLMENTS.md`

---

## 2. Botões “Detalhes” no padrão do Dashboard

### Problema

Os botões Detalhes de Parcelamentos / Empréstimos / Financiamentos não
seguiam o visual das ações rápidas neutras do Dashboard (“Novo cartão”,
“Nova conta”, “Novo parcelamento”).

### Decisões

* `variant="neutral"` (borda, fundo transparente, texto muted)
* Tipografia/altura alinhadas às quick actions: `h-9`, `text-[13px] font-bold`,
  `rounded-[10px]`, ícone `Eye` à esquerda

### Arquivos

* `installment-purchase-card.tsx`
* `loan-card.tsx`
* `financing-card.tsx`

---

## 3. Feat Investimentos (CDB / % do CDI)

### Objetivo

Página própria `/investments` (espelho de Financiamentos) para produtos
indexados ao CDI (ex.: Cofrinho Nubank 115% do CDI), com aporte que debita a
conta (teto = saldo), consulta CDI e projeção estimada.

### Decisões travadas

| Tema | Decisão |
|------|---------|
| Relação com Patrimônio | Domínio = `Asset` `type=INVESTMENT` (como Financiamento = `Loan` `kind=FINANCING`) |
| Taxa | Híbrida: default `% do CDI` no Asset; override opcional no aporte |
| Aporte | `Transaction` EXPENSE paga + sobe `currentValue` + `AssetSnapshot` |
| Saldo | Bloqueio duro se `amount > saldo` (`INSUFFICIENT_ACCOUNT_BALANCE`) |
| Escopo da entrega | Núcleo + CDI (Gemini) + projeção (juros simples) na mesma leva |
| Fora de escopo | Resgate/saque; atualização automática periódica de `currentValue` por rendimento; Tesouro/ações/fundos |

### Modelo de dados

* **Asset:** `yieldBenchmark` (`NONE` \| `CDI`), `yieldPercentOfBenchmark`
* **Transaction:** `assetId` (FK opcional), `yieldPercentOfBenchmark` (override)
* **MarketIndexQuote:** cache diário CDI (`GEMINI` \| `MANUAL`), unique `(index, date)`
* Migration: `prisma/migrations/20260709160000_investments/`

### Fluxos

1. **Criar investimento** — nome + % CDI; aporte inicial opcional (atômico).
2. **Aportar** — ownership + saldo + EXPENSE + snapshot.
3. **CDI do dia** — cache → Gemini (`source: "cdi-quote"`) → fallback manual.
   Sempre rotular como estimativa (Gemini ≠ BCB).
4. **Projeção** — juros simples:  
   `yield = principal * (cdi/100) * (percent/100) * (days/365)`  
   Não altera patrimônio.

### UI

* Lista `/investments` + detalhe `/investments/[id]`
* Nav: Planejamento → Investimentos (`TrendingUp`)
* Form genérico de `/assets`: tipo INVESTMENT escondido na criação

### Módulo

`src/modules/investments/` — schemas, repository, contribute, cdi, project,
service, actions, errors.

### Cuidado patrimonial

Aporte reduz conta e sobe asset → patrimônio total (contas + assets) estável.
Não somar o aporte em outro KPI.

Doc canônico: **`docs/28-INVESTMENTS.md`**.

---

## 4. Integração Telegram (investimentos)

### Problema

A feat web não falava com o bot. O usuário queria:

1. Perguntar quais investimentos tem → lista + total.
2. Dizer “investi R$ 100 no Cofrinho Nubank” → aporte com validação de saldo.

### Decisões

| Fluxo | Mecanismo |
|-------|-----------|
| Consulta | `intent=query`, `queryType=investments` |
| Aporte | `intent=invest` + payload `invest.{amount, investmentName, accountName?}` |
| Conta omitida | Conta ativa default |
| Categoria do aporte | Seed `Investimento (aporte)` |
| Saldo insuficiente | Erro explícito; **não** cria lançamento |

### Arquivos Telegram

* `ai-parser.ts` — intents/prompts (texto + voz) + nomes de investimentos no contexto
* `query.ts` / `reply.ts` — lista e total
* `invest.ts` — `handleInvestContribution`
* `resolve.ts` — match por nome, conta default, categoria aporte
* `handlers.ts` — desvio `query` / `invest` (texto e voz)
* `types.ts` — `TelegramInvestParsed`, `investments` em `TelegramQueryResult`

Exemplos de mensagem:

```text
quais meus investimentos
investi 100 no Cofrinho Nubank
aportei 200 no CDB
```

Doc: seções em **`docs/30-TELEGRAM.md`** + ponte em **`docs/28-INVESTMENTS.md`**.

---

## 5. Docs atualizados nesta sessão

| Doc | O quê |
|-----|--------|
| `docs/28-INVESTMENTS.md` | **Novo** — módulo canônico |
| `docs/03-DATABASE.md` | Asset yield, Transaction.assetId, MarketIndexQuote, aporte |
| `docs/06-SCREENS.md` | Tela `/investments` + rota na nav |
| `docs/23-INSTALLMENTS.md` | Troca de categoria |
| `docs/27-ASSETS.md` | Assets vs aportes (não alteram orçamento sozinhos) |
| `docs/30-TELEGRAM.md` | Consulta + aporte de investimentos |
| Este arquivo | Spec/resumo da sessão |

---

## 6. Pendências operacionais

* Aplicar migration no ambiente com DB:  
  `npx prisma migrate deploy`  
  (requer `DATABASE_URL` / `POSTGRES_URL_NON_POOLING`)
* Resgate de investimento e rendimento automático de `currentValue` —
  **não** planejados nesta sessão (backlog consciente).

---

## 7. Mapa rápido de código novo

```text
src/app/(app)/investments/
src/components/investments/
src/modules/investments/
src/modules/telegram/invest.ts
prisma/migrations/20260709160000_investments/
docs/28-INVESTMENTS.md
```
