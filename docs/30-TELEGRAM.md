# 30 - TELEGRAM.md

# Integração com Telegram

Este módulo permite registrar e consultar informações financeiras diretamente pelo Telegram.

Ele funciona como uma interface rápida do sistema principal.

---

# Objetivo

Permitir que o usuário:

* registre transações rapidamente via mensagem
* consulte gastos e saldo
* receba resumos automáticos
* interaja sem abrir o sistema web

---

# Regra Principal

O Telegram é uma interface alternativa.

Ele nunca substitui o sistema principal.

Ele apenas acelera entradas e consultas.

---

# Endpoint

Webhook exposto em `POST /api/telegram` (Route Handler — exceção ao padrão Server Actions do app, junto com os crons), compartilhado por TODOS os bots (um por usuário). Recebe o update do Telegram, identifica de qual usuário é o bot pelo secret do header (ver "Segurança"), processa e responde.

---

# Fluxo de Uso

## Registro de gasto

```text id="t1k8qp"
Usuário envia:

mercado 120
```

Sistema interpreta:

* tipo: EXPENSE
* valor: 120
* categoria: Alimentação (inferida)

````

---

## Registro com categoria explícita

```text id="c3v8qp"
almoço 45 restaurante
````

---

## Registro com tag

```text id="m7k2qp"
uber 30 trabalho
```

---

## Receita

```text id="r4v8qp"
salário 5000
```

---

# Estrutura de Interpretação

Sistema deve interpretar mensagens com base em:

```text id="i2k7qp"
valor numérico

palavras-chave

contexto histórico do usuário

categorias mais usadas

tags existentes
```

---

# Regras de Parsing

## Regra 1

Se houver número → é valor obrigatório

---

## Regra 2

Se não houver categoria → inferir automaticamente. Se a inferência for ambígua ou não reconhecer nada, cai em fallback: categoria **"Outros"** — nunca fica sem categoria.

---

## Regra 3

Se não houver data → usar data atual

---

## Regra 4

Se houver múltiplas palavras → primeira é descrição

---

# Parsing por IA (lançamento livre)

Híbrido: comandos determinísticos continuam 100% regex; só o lançamento
livre passa por IA.

* **Nunca chamam a IA** (resolvidos 100% pelo parser regex, `parser.ts`,
  rápido e grátis): `saldo`, `hoje`, `gastos mes`, `/vincular`, `/start`.
* **Passa pela IA**: qualquer mensagem que hoje cairia em
  `create_transaction` ou `unknown` (o lançamento livre em si) —
  `modules/telegram/ai-parser.ts`, `parseTransactionWithAI`. Modelo: Gemini
  Flash (`gemini-2.5-flash`), REST `generateContent` (`v1beta`) com
  `responseMimeType: "application/json"` + `responseSchema` (structured
  output) — **sem SDK**, `fetch` nativo (Vercel serverless já tem fetch).
* A IA extrai, a partir da mensagem + do contexto do usuário (categorias,
  contas, cartões reais, passados no prompt):
  * `isTransaction` — `false` se a mensagem não for um lançamento (saudação,
    pergunta etc.), aí cai na resposta padrão de "não entendi".
  * `type` (EXPENSE/INCOME), `amount`, `description`.
  * `date` — resolve relativos ("hoje"/"ontem"/"amanhã") e absolutos ("dia
    18/06") contra a data de referência (`todaySaoPaulo`, "hoje" em
    America/Sao_Paulo); `null` se a mensagem não menciona data (vira "hoje").
  * `categoryName` — nome mais próximo dentre as categorias REAIS do usuário
    (ambos os tipos, passadas no prompt); `null` se nada bate.
  * `originKind`/`originName` — se a mensagem citar um CARTÃO ("cartão X", "X
    crédito/débito") ou uma CONTA/banco/pix, a IA escolhe o nome mais próximo
    dentre as contas/cartões ATIVOS reais do usuário (passados no prompt);
    ambos `null` se não mencionou origem nenhuma.
* **Fallback determinístico** — sem `GEMINI_API_KEY`, erro de rede, timeout
  (~8s, `AbortController`) ou JSON fora do shape esperado (validado com zod,
  nunca confiamos cegamente na saída de um LLM) → `parseTransactionWithAI`
  retorna `null` e o webhook cai automaticamente no resultado do parser regex
  de sempre: `create_transaction` vira o lançamento clássico (hoje + pago),
  `unknown` vira a resposta padrão de "não entendi". **A IA nunca pode
  derrubar o bot.**
* **Regra determinística de `isPaid` (fora da IA, sempre em código)**: data
  resolvida > hoje (America/Sao_Paulo) → `isPaid=false` (lançamento
  previsto/futuro); senão `isPaid=true`. A IA só sugere a data — quem decide
  "previsto vs. pago" é `handlers.ts`.
* **Resolução de categoria/origem** — match EXATO (case/acento-insensível)
  contra os nomes reais do usuário (`resolve.ts`, `resolveCategoryByName`/
  `resolveOrigin`); sem match → cai no MESMO fallback de sempre: categoria
  "Outros"/"Outros (Receita)"; origem = conta ativa mais antiga do usuário
  (comportamento idêntico ao lançamento rápido regex, nunca muda).
* Um cartão/conta só é escolhido se **existir de fato** cadastrado e ATIVO no
  app do usuário — nome sugerido pela IA que não bate com nada real cai no
  fallback default, nunca quebra/erra.
* A confirmação (`reply.ts`) mostra origem ("Conta X"/"Cartão X") e data
  (`dd/mm/aaaa`, com "(previsto)" quando `isPaid=false`), além de
  descrição/valor/categoria já existentes.
* `GEMINI_API_KEY` precisa estar setada tanto local (`.env`) quanto na Vercel
  (Production) — sem ela, o bot continua funcionando normalmente, só no modo
  regex-only (nenhuma feature quebra por falta da key).

---

# Comandos

## Nova transação

```text id="n1v8qp"
mercado 120
```

---

## Consulta de saldo

```text id="s3k9qp"
saldo
```

---

## Gastos do mês

```text id="g7m2qp"
gastos mes
```

---

## Resumo diário

```text id="d4v8qp"
hoje
```

---

# Respostas do Bot

## Confirmação de transação

```text id="c2k8qp"
✔ Gasto registrado

Mercado - R$ 120
Categoria: Alimentação
Origem: Conta Nubank
Data: 06/07/2026
```

Com data futura (lançamento previsto) a linha de data ganha o sufixo
"(previsto)" (ex.: `Data: 18/06/2026 (previsto)`) — ver "Parsing por IA".

Confirmação inline por botão (ex.: trocar categoria antes de salvar) é opcional, não obrigatória no MVP.

---

## Resumo

```text id="r7v2qp"
📊 Gastos do mês

Alimentação: R$ 1.200
Carro: R$ 400
Casa: R$ 800

Total: R$ 2.400
```

---

# Integração com Sistema

Todas as mensagens criam ou consultam:

* Transactions
* Categories
* Tags
* Accounts
* Cards

---

# Segurança

**Modelo "traga seu próprio bot"** — não existe mais um bot único global via env. Cada usuário cria seu próprio bot no @BotFather e cola o token em Configurações (`installTelegramBotAction`); o sistema valida o token (`getMe`), gera um `telegramWebhookSecret` só dele (`crypto.randomBytes`) e registra o webhook (`setWebhook`) apontando pro mesmo endpoint `/api/telegram` pra todo mundo. `UserSettings.telegramBotToken`/`telegramWebhookSecret`/`telegramBotUsername`/`telegramWebhookRegistered` guardam esse estado por usuário (`modules/settings/service.ts`, `installTelegramBot`/`uninstallTelegramBot`). Token em plaintext no banco é aceitável no contexto de 2 usuários confiáveis — ver `03-DATABASE.md`.

* **Identificação do usuário no webhook:** toda request em `/api/telegram` lê o header `X-Telegram-Bot-Api-Secret-Token` e busca `UserSettings` por `telegramWebhookSecret` (`modules/telegram/webhook-auth.ts`, `resolveUserByWebhookSecret`) — é ASSIM que o sistema sabe de qual usuário é o bot que recebeu o update. Sem header ou sem match no banco → 401, descarta sem processar.
* **Vínculo do chat (self-service)** — inalterado no fluxo de UX: o vínculo vive em `UserSettings.telegramChatId` (`@unique`). Cada usuário gera, em Configurações, um código de 6 caracteres válido por 15min (`UserSettings.telegramLinkCode`/`telegramLinkCodeExpiresAt`) e confirma enviando `/vincular <CODE>` (ou o deep-link `/start <CODE>`) pro PRÓPRIO bot. O código é validado contra o `userId` já resolvido pelo secret (`modules/telegram/link.ts`, `tryLinkFromMessage`) — não existe mais busca global de código entre usuários. Ver `12-SETTINGS.md`, "3. Telegram".
* Comando de vínculo (`/vincular`/`/start`) roda **antes** da checagem de chat vinculado no webhook — é assim que um `chat_id` novo, ainda não vinculado a esse bot, entra no sistema. Mensagem de um `chat_id` diferente do vinculado (e que não é um comando de vínculo): **rejeitar silenciosamente** (sem responder — não confirma ao remetente que o bot existe).
* **Legado removido:** o secret único global (`TELEGRAM_WEBHOOK_SECRET`) e a allowlist fixa via env (`TELEGRAM_ALLOWED_CHAT_IDS`) não existem mais — cada usuário tem seu próprio secret/bot no banco.
* **Logs:** nunca logar corpo da mensagem nem valores monetários — só `chat_id` + resultado (ex.: `chat_id=123 -> transaction_created`, `chat_id=123 -> telegram_linked`).

---

# Limitações

* não suporta edição complexa
* não substitui dashboard
* não substitui relatórios

---

# UX Principal

O objetivo é:

> registrar gasto em menos de 5 segundos

---

# Casos de Uso

## Caso 1

Usuário no mercado:

```text id="u1k8qp"
"mercado 85"
```

---

## Caso 2

Pagamento rápido:

```text id="p7v2qp"
"uber 25 trabalho"
```

---

## Caso 3

Receita:

```text id="r3m8qp"
"freela 800"
```

---

# Regras de Negócio

## Regra 1

Toda mensagem com valor numérico gera transação.

---

## Regra 2

Toda transação criada via Telegram segue mesmas regras do sistema principal.

---

## Regra 3

Telegram não pode criar dados inconsistentes.

---

# Performance

* respostas devem ser instantâneas
* processamento leve
* sem dependência de UI

---

# Evolução Futura

* comandos mais inteligentes
* notificações de orçamento
* alertas de cartão
* resumo semanal automático

---

# Filosofia

O Telegram é a “entrada rápida” do sistema financeiro.

Ele remove fricção.

Ele substitui a necessidade de abrir o app para pequenas ações.
