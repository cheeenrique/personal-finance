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
* categoria: Mercado (inferida — categoria ESPECÍFICA que casou, filha de
  Alimentação, sem subir pro pai)

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
  * `type` (EXPENSE/INCOME) — por DIREÇÃO do dinheiro: "recebido"/"recebi"/
    "caiu" (entrou) → INCOME; "paguei"/"comprei"/"para <alguém>" (saiu) →
    EXPENSE. Ambíguo assume EXPENSE.
  * `amount` — `null` se a mensagem não menciona nenhum valor numérico (a IA
    NUNCA inventa um valor); vira pergunta, ver "Fluxo conversacional"
    abaixo.
  * `description` — pessoa/empresa EXTERNA citada (ex.: "mãe", "Romeika",
    "Funape" — alguém que não é o próprio usuário) SEMPRE vai aqui, nunca
    vira conta/cartão.
  * `date` — resolve relativos ("hoje"/"ontem"/"amanhã") e absolutos ("dia
    18/06") contra a data de referência (`todaySaoPaulo`, "hoje" em
    America/Sao_Paulo); `null` se a mensagem não menciona data (vira "hoje").
  * `categoryName` — nome mais próximo dentre as categorias REAIS do usuário
    (ambos os tipos, passadas no prompt); `null` se nada bate.
  * `paymentMethod` — canal do lançamento: `"credit"` (cartão de crédito),
    `"debit"` (cartão de débito), `"pix"`, `"transfer"` (transferência/TED/
    DOC) ou `"cash"` (dinheiro/espécie); `null` se a mensagem não menciona
    nenhum canal. Refina `originKind`/`originName` abaixo (ver
    `resolve.ts`, `expectedOriginKind`): `"credit"` só resolve pra CARTÃO,
    os demais só pra CONTA.
  * `originKind`/`originName` — só preenchidos se o nome citado bater com um
    item REAL das listas de contas/cartões ATIVOS do usuário passadas no
    prompt; nome de pessoa/empresa externa (que foi pra `description`) NUNCA
    é origem, mesmo perto de "pix"/"transferência". Sem menção de conta/
    cartão real, ambos `null`.
* **Fallback determinístico** — sem `GEMINI_API_KEY`, erro de rede, timeout
  (~8s, `AbortController`) ou JSON fora do shape esperado (validado com zod,
  nunca confiamos cegamente na saída de um LLM) → `parseTransactionWithAI`
  retorna `null` e o webhook cai automaticamente no resultado do parser regex
  de sempre: `create_transaction` vira o lançamento clássico (hoje + pago,
  origem = conta ativa mais antiga do usuário, SEM fluxo de pergunta),
  `unknown` vira a resposta padrão de "não entendi". **A IA nunca pode
  derrubar o bot** — esse fallback é o único caminho que ainda usa
  `resolveOrigin` (com default de conta), ver `resolve.ts`.
* **Regra determinística de `isPaid` (fora da IA, sempre em código)**: data
  resolvida > hoje (America/Sao_Paulo) → `isPaid=false` (lançamento
  previsto/futuro); senão `isPaid=true`. A IA só sugere a data — quem decide
  "previsto vs. pago" é `draft.ts`.
* **Resolução de categoria** — match EXATO (case/acento-insensível) contra os
  nomes reais do usuário (`resolve.ts`, `resolveCategoryByName`); sem match →
  cai no fallback de sempre: categoria "Outros"/"Outros (Receita)". Categoria
  NUNCA bloqueia o lançamento nem gera pergunta. Sempre usa a categoria
  ESPECÍFICA que casou — própria OU filha —, **sem subir pro pai** (ex.:
  "Delivery" casa com "Delivery", não vira "Alimentação"); só usa o pai quando
  o próprio usuário/IA citou o nome do pai diretamente. Mesma regra vale pro
  parser regex (`resolveCategoryId`) e pro match por palavra-chave/histórico —
  granularidade específica em texto e foto, pros relatórios ficarem mais úteis.
* **Resolução de origem no caminho de sucesso da IA** — `resolve.ts`,
  `resolveOriginStrict`: DIFERENTE do fallback acima, aqui NÃO existe default
  de conta. Sem `originName` resolvido pro tipo esperado (`expectedOriginKind`
  a partir do `paymentMethod`) → vira pergunta (ver "Fluxo conversacional").
* A confirmação (`reply.ts`) mostra origem ("Conta X"/"Cartão X") e data
  (`dd/mm/aaaa`, com "(previsto)" quando `isPaid=false`), além de
  descrição/valor/categoria já existentes.
* `GEMINI_API_KEY` precisa estar setada tanto local (`.env`) quanto na Vercel
  (Production) — sem ela, o bot continua funcionando normalmente, só no modo
  regex-only (nenhuma feature quebra por falta da key).

---

# Parsing por IA (lançamento via FOTO)

O bot também aceita **foto** de nota fiscal, comprovante (Pix/transferência)
ou notificação push do banco/cartão (print de tela do celular) — ex.: "Compra
no crédito aprovada — Compra de R$ 67,89 APROVADA em FILIAL ELDORA para o
cartão com final 7547.". Extração via Gemini **vision** (mesmo modelo,
`gemini-2.5-flash`, mesmo endpoint `generateContent`, mesmo `responseSchema`),
`modules/telegram/ai-parser.ts`, `parseTransactionFromImage`.

* **Detecção** — `message.photo` do Telegram é um array de `PhotoSize`
  (thumb→full, ordem não garantida); `modules/telegram/photo.ts`,
  `extractLargestPhoto` (função pura) pega a de MAIOR `width` (melhor
  qualidade de leitura) + o `caption` opcional (texto junto da foto, vira
  dica extra no prompt).
* **Download** — `modules/telegram/telegram-api.ts`, `downloadPhoto`:
  `getFile(file_id)` resolve o `file_path`, depois baixa os bytes de
  `https://api.telegram.org/file/bot<TOKEN>/<file_path>` (mesmo token do bot
  do usuário, BYO-bot). Timeout de 8s em cada chamada — `null` em qualquer
  falha (arquivo expirado, rede, timeout), o webhook responde pedindo pra
  reenviar.
* **Extração** — mesmas regras de type/amount/description/categoryName/
  paymentMethod da extração por texto (ver seção acima), só a FONTE muda
  (imagem via `inlineData` + prompt, em vez de texto puro). Cobre recibo, nota
  fiscal, comprovante de Pix E notificação push do banco — o prompt trata os
  4 formatos igual.
* **`originKind`/`originName` na imagem** — mesma regra estrita do texto: só
  preenche se o NOME de uma conta/cartão REAL do usuário aparecer na imagem.
  Uma notificação citando só "cartão com final 7547" (dígitos, não nome) NÃO
  é suficiente pra resolver qual cartão cadastrado é — o app não guarda os
  últimos dígitos de nenhum cartão — então a IA deixa `originName=null` nesse
  caso e o fluxo conversacional pergunta "De onde saiu?" normalmente (nunca
  inventa um cartão a partir do número).
* **Mesmo fluxo conversacional do texto** — a partir do momento em que a IA
  reconhece um lançamento na foto (`isTransaction=true` + `amount` legível),
  o resultado cai no MESMO `processDraft` (`draft.ts`) do texto: confirma
  origem ambígua, aplica a tag "Telegram", cria a transação. Sem fallback
  determinístico pra foto (não dá pra "regex" uma imagem) — sem
  `GEMINI_API_KEY`, erro/timeout, imagem sem lançamento reconhecível ou sem
  valor legível, o bot responde pedindo pra reenviar a foto (mais nítida) ou
  digitar o lançamento em texto, sem abrir pending.
* Uma foto enviada enquanto já existe um pending em aberto (pergunta de
  valor/origem pendente) NÃO é tratada como resposta a esse pending nesta
  versão — vira um lançamento novo via imagem (o pending antigo só expira
  pelo TTL de sempre). Fora de escopo desta iteração.

---

# Fluxo conversacional (rascunho pendente)

Quando o lançamento livre passa pela IA com sucesso (`isTransaction=true`),
DOIS campos são obrigatórios pra criar a transação: **valor** e **origem
resolvível** (uma conta OU cartão real e ATIVO do usuário, conforme
`paymentMethod`). Categoria nunca é obrigatória (fallback "Outros"/"Outros
(Receita)", `resolveCategoryByName`). Faltando um dos dois, o bot PERGUNTA em
vez de assumir um default — diferente do fallback determinístico (sem IA),
que nunca pergunta (ver seção acima).

* **Estado** — `TelegramPendingEntry` (1 por usuário, `userId @unique`):
  `draftJson` (o rascunho — `TelegramDraft`, ver `modules/telegram/types.ts`),
  `missingField` (`"amount"` | `"origin"`), `attempts` (rodadas de pergunta já
  feitas) e `expiresAt` (~10min de TTL). CRUD em
  `modules/telegram/pending.ts` (`telegramPendingRepository`).
* **Detecção** — toda mensagem no caminho de lançamento livre
  (`handlers.ts`, `handleFreeformEntry`) primeiro checa se existe um pending
  ATIVO (não expirado) pro usuário. Se sim, a mensagem é tratada como
  RESPOSTA a ele (`draft.ts`, `handlePendingReply`), nunca como um lançamento
  novo — mesmo que pareça um. Pending expirado é tratado como se não
  existisse (apagado na leitura, `pending.ts`).
* **Cancelamento** — responder `cancelar` (case/acento-insensível) apaga o
  pending e confirma, sem criar nada.
* **Merge da resposta** — `modules/telegram/pending-merge.ts`,
  `mergeReplyIntoDraft`. DETERMINÍSTICO (sem 2ª chamada à IA — resposta curta,
  vocabulário fixo, custo/latência de IA não compensam aqui):
  * `missingField="amount"` — extrai o primeiro número da resposta (ex.: "30",
    "foi 30", "R$ 30,50").
  * `missingField="origin"` — reconhece o canal por palavra-chave
    ("crédito"/"débito"/"pix"/"transferência"/"dinheiro") e o nome de
    conta/cartão real ATIVO como SUBSTRING da resposta normalizada (ex.: "pix
    nubank" bate com a conta "Nubank").
* **Rodadas** — cada pergunta incrementa `attempts`; depois de ~3 rodadas sem
  resolver, o bot desiste (apaga o pending, pede pra reenviar a mensagem
  completa) em vez de perguntar pra sempre.
* **Conclusão** — draft completo cria a transação (mesma regra de `isPaid`,
  mesma tag "Telegram" do lançamento direto) e apaga o pending.

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

# Ícones padronizados

Telegram só suporta emoji (sem cor/bg custom) — TODA resposta do bot começa
com um destes três, nunca outro emoji solto:

| Ícone | Significado | Exemplos |
|-------|--------------|----------|
| ✅ | Sucesso / cadastrado / consulta ok | confirmação de transação, saldo, resumo, vínculo confirmado, cancelamento de pending |
| ❌ | Erro | erro de validação/domínio, código de vínculo inválido/expirado |
| ⚠️ | Falta info / precisa responder | pergunta de valor/origem faltante, "não entendi", desistência após ~3 rodadas |

Implementado em `modules/telegram/reply.ts` — todo `build*Reply` usa um dos
três (nada de `💰`/`📊`/`📅`/`🤔`/`✔` soltos).

---

# Respostas do Bot

## Confirmação de transação

```text id="c2k8qp"
✅ Gasto registrado

Mercado - R$ 120
Categoria: Alimentação
Origem: Conta Nubank
Data: 06/07/2026
```

Com data futura (lançamento previsto) a linha de data ganha o sufixo
"(previsto)" (ex.: `Data: 18/06/2026 (previsto)`) — ver "Parsing por IA".

Confirmação inline por botão (ex.: trocar categoria antes de salvar) é opcional, não obrigatória no MVP.

---

## Pergunta de info faltante

```text id="p9v3qp"
⚠️ Quanto foi?
```

```text id="o5k1qp"
⚠️ De onde saiu?
Responda com o cartão ou conta (ex.: crédito Nubank, pix Carteira).
```

Ver "Fluxo conversacional" acima — a resposta do usuário é mesclada no
rascunho pendente até completar valor + origem.

---

## Resumo

```text id="r7v2qp"
✅ Gastos do mês

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

Toda transação criada pelo bot (IA ou fallback regex) leva automaticamente a
tag **"Telegram"** (find-or-create por nome, case-insensitive —
`modules/telegram/telegram-tag.ts`, `tagService.findOrCreateByName`), pra
diferenciar na UI o que foi lançado pelo Telegram do que foi lançado
manualmente. Nunca afeta transações criadas pela UI web.

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
* **Follow-up documentado — transferência interna real (2 pernas):** hoje
  `paymentMethod="transfer"` é tratado como um canal de pagamento NUMA conta
  (gera INCOME ou EXPENSE conforme a direção, igual pix/débito/dinheiro) —
  nunca como `type=TRANSFER` de verdade entre 2 contas do próprio usuário
  (docs/03-DATABASE.md, "Transferências": 2 Transactions com `transferId`
  compartilhado). Detectar "transferi de X pra Y" (ambas contas do usuário) e
  gerar as 2 pernas automaticamente via Telegram fica para uma iteração
  futura — fora de escopo desta versão (YAGNI: sem caller/exemplo real nos
  testes desta fase).

---

# Filosofia

O Telegram é a “entrada rápida” do sistema financeiro.

Ele remove fricção.

Ele substitui a necessidade de abrir o app para pequenas ações.
