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

Webhook exposto em `POST /api/telegram` (Route Handler — exceção ao padrão Server Actions do app, junto com os crons), compartilhado por TODOS os bots (um por usuário). Recebe o update do Telegram (`message` — texto/foto/voz/documento — ou `callback_query`), identifica de qual usuário é o bot pelo secret do header (ver "Segurança"), processa e responde.

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
  contas, cartões, **investimentos** reais, passados no prompt):
  * `intent` — `register` | `query` | `ask` | `invest` | `create_category` |
    `unknown`
  * `isTransaction` — `false` se a mensagem não for um lançamento (saudação,
    pergunta etc.) — nesse caso o bot NUNCA fica mudo: cai no responder
    inteligente (`ask.ts`, `answerQuestion` — ver "Responder inteligente"
    abaixo), nunca numa resposta seca.
  * Para `intent=invest`: `invest.amount`, `invest.investmentName`,
    `invest.accountName` (opcional)
  * Para `intent=query`: `query.queryType` inclui `investments` (lista/
    posição/total) além de spent/received/balance/etc.
  * Para `intent=create_category`: `createCategory.categoryName` (obrigatório),
    `createCategory.parentName` (opcional) — ver "Criar categoria pelo
    Telegram" abaixo.
  * Para `intent=ask`: a pergunta cai no responder inteligente (`ask.ts`) —
    ver seção própria abaixo.
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

O bot também aceita **foto** de nota fiscal, comprovante (Pix/transferência),
notificação push do banco/cartão **ou tela de detalhe da compra no app do
cartão** (ex.: Nubank — logo do estabelecimento, valor grande `R$ …`, data por
extenso, "Compra à vista", "Dado original", "Cartão virtual …. XXXX"). A imagem
pode conter **1 OU VÁRIOS lançamentos** — ex.: print de UMA notificação de
compra (1 lançamento) ou print com VÁRIAS notificações/comprovantes
empilhados na mesma tela (N lançamentos). Extração via camada de IA
(`@/lib/ai/extract`, `role: "document-vision"` — NVIDIA `nemotron-nano-12b-v2-vl`,
fallback Gemini automático quando o primário esgota, ver `models.ts`),
`modules/telegram/ai-parser.ts`, `parseTransactionFromImage` — sempre devolve
um **array** (`AiParsedTransaction[]`, `[]` quando não há nenhum lançamento
legível).

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
* **Extração** — mesmas regras de type/amount/description/paymentMethod da
  extração por texto (ver seção acima), aplicadas POR ITEM de `transactions[]`
  — só a FONTE muda (imagem via bytes + prompt). Cobre recibo, nota fiscal,
  comprovante de Pix, notificação push **e tela de detalhe no app do
  cartão** — o prompt trata esses formatos como lançamento válido quando há
  valor + estabelecimento. `amount` de cada item é normalizado (vírgula →
  ponto decimal) antes da validação zod — o VLM às vezes devolve o valor no
  formato BR mesmo instruído a usar ponto. Item malformado individual é
  descartado isoladamente (erro-como-dado), nunca derruba os demais itens
  válidos da mesma imagem.
* **Prompt enxuto de propósito** — o caminho de FOTO (`buildImagePrompt`,
  `ai-parser.ts`) NÃO carrega a lista de ~40 merchants conhecidos nem a
  prosa longa de regras de categoria que texto/voz recebem (`contextBlock`
  com `includeMerchants: false`) — só uma linha simples pedindo o nome mais
  próximo dentre as categorias do usuário. Motivo: esse contexto extra
  inflava o thinking token do modelo e estourava o timeout em fotos simples.
  A IA SEMPRE sugere uma categoria pra foto também — nunca bloqueia o
  lançamento por falta dela (mesma regra do texto, ver "Resolução de
  categoria" acima); o usuário troca pelo botão **Trocar categoria** depois
  de cadastrado (ver "Botões inline", só disponível no caminho de 1
  lançamento). Texto e voz continuam com o contexto rico (merchants + regras
  completas) — só a foto foi enxugada.
* **Legenda inteligente** — se o `caption` casar (case-insensitive) com o nome
  de um cartão/conta ATIVO do usuário (ex.: "Crédito pessoal"), vira
  `originName`/`paymentMethod` de forma determinística em `handlers.ts`
  (`enrichAiOriginFromCaption`) — **não** vira `categoryName`. Categoria vem
  do estabelecimento / "Dado original" / itens da imagem. Final `…. 7547`
  sozinho continua **não** resolvendo cartão. `enrichAiOriginFromCaption` só
  se aplica ao caminho de **1** lançamento (fluxo conversacional).
* **`originKind`/`originName` na imagem** — mesma regra estrita do texto: só
  preenche se o NOME de uma conta/cartão REAL do usuário aparecer na imagem
  (ou na legenda, acima). Dígitos do cartão NÃO bastam.
* **1 lançamento reconhecido** — a partir do momento em que a IA reconhece o
  lançamento na foto (`amount` legível), o resultado cai no MESMO
  `processDraft` (`draft.ts`) do texto (híbrido com botões — ver abaixo):
  pergunta origem ambígua/faltante quando necessário, cria com botões
  pós-save (Desfazer / Trocar categoria / Trocar origem).
* **N lançamentos reconhecidos (N>1)** — `handlers.ts`,
  `handleMultipleImageTransactions`: cria TODOS direto, SEM fluxo de
  pergunta por item (perguntar N vezes numa foto só seria péssima UX) —
  categoria por histórico/nome (`resolveCategoryByName`) e origem DEFAULT
  quando a IA não identificou uma origem real (`resolveOrigin`, mesmo
  fallback do lançamento rápido regex), mesma tag "Telegram" e regra de
  `isPaid` de sempre (`createBotTransaction`). Resposta combinada
  (`buildMultiTransactionReply`, `reply.ts`): "✅ N lançamentos cadastrados" +
  lista "descrição — valor" por item + total. Item que falhar na criação
  (erro de validação isolado) é descartado da lista, sem derrubar os demais;
  se TODOS falharem, resposta de erro genérica em vez de confirmação vazia.
  Sem botões por item nesta versão.
* Sem fallback determinístico pra foto (não dá pra "regex" uma imagem) —
  array vazio (extração indisponível/timeout, imagem sem nenhum lançamento
  reconhecível, ou nenhum item com valor legível) responde pedindo pra
  reenviar o print inteiro ou digitar em texto (mensagem honesta, sem culpar
  "luz/foco"), sem abrir pending. `resultCode: "image_unreadable"`.
* Uma foto enviada enquanto já existe um pending em aberto (pergunta de
  valor/origem pendente) NÃO é tratada como resposta a esse pending nesta
  versão — vira um lançamento novo via imagem (o pending antigo só expira
  pelo TTL de sempre). Fora de escopo desta iteração.

---

# Parsing por IA (nota de VOZ / áudio)

O bot aceita áudio nestes formatos da Bot API (mesmo pipeline Gemini):

* **nota de voz** — `message.voice` (OGG Opus)
* **arquivo de áudio** — `message.audio` (player de música no app)
* **documento de áudio** — `message.document` com mime `audio/*` ou
  extensão `.ogg`/`.mp3`/… (forward / "enviar como arquivo")

Sem tratar `audio`/`document` áudio, o webhook respondia `200` e o usuário
ficava **sem mensagem** — bug corrigido em 2026-07-09 (`extractVoiceLike`).

Gemini 2.5 Flash entende áudio nativo (`inlineData`); **não** há STT
separado. Mesmo `responseSchema` do texto — `parseTransactionFromVoice`.

* **Detecção** — `modules/telegram/voice.ts`, `extractVoiceLike` (pura).
* **Download + limpeza** — `telegramApi.downloadVoice`: tmp + apaga no
  `finally`. Nunca loga bytes.
* **Limite** — duração > 60s → recusa e pede texto (antes de baixar).
* **Fluxo** — igual ao texto livre: register / invest / query. Sem
  `GEMINI_API_KEY` / timeout / áudio inaudível → `buildVoiceUnreadableReply`.
* **Voz com pending aberto** — **não** é tratada como resposta ao pending
  (igual antes), mas a mensagem mudou: NÃO cai mais no genérico "não
  entendi essa nota de voz" (`buildVoiceUnreadableReply`) — o áudio nem
  chega a ser processado pelo Gemini. Responde honesto,
  `buildVoicePendingOpenReply()`: "Você tem uma pergunta em aberto. Responda
  ela primeiro (ou envie \"cancelar\")." (`resultCode: voice_pending_open`).
* Timeout Gemini da voz: 20s; webhook `maxDuration=30`.

## Vídeo (não aceito)

`message.video_note` (vídeo circular / "round video") e `message.video`
**não** são processados. O bot responde com `buildVideoRejectedReply`
pedindo nota de voz (microfone) ou texto — nunca fica mudo.


---

# Responder inteligente (`intent="ask"` + mensagem sem intent reconhecida)

O bot NUNCA fica mudo — toda mensagem de texto/voz que não vira lançamento,
consulta, aporte ou criação de categoria cai no "assistente do bot"
(`modules/telegram/ask.ts`, `answerQuestion`).

* **Modelo** — `callGemini` (`@/lib/ai/gemini.ts`) DIRETO, mesma infra rápida
  do parser de texto/voz (`ai-parser.ts`) — **não** usa mais
  `extractStructured`/NVIDIA (cadeia antiga: 60s + retry 60s + fallback
  Gemini 8s, pior caso ~128s, MUITO acima do `maxDuration=30` do webhook —
  era a causa raiz do bot "ficar mudo" em pergunta livre). Timeout de 10s
  (`ASK_TIMEOUT_MS`), sem retry — pior caso ~10s + latência de rede.
* **4 comportamentos, numa ÚNICA chamada de IA** (mesmo padrão de
  `ai-parser.ts`, que já classifica `intent` numa única chamada — sem 2ª
  chamada de "classificar antes de responder"):
  1. **Pergunta financeira** — responde ancorada nos números do
     `buildNumbersText` (saldo, gastos/receitas do mês e do mês passado, top
     categorias, score de saúde) — nunca inventa valor/categoria/período fora
     da lista.
  2. **Capacidade** ("o que você faz?", "o que você sabe fazer?") — lista o
     que o bot faz, com base no `BOT_CAPABILITIES_BLOCK` (fonte única de
     verdade do prompt).
  3. **Fora de escopo** (editar/apagar conta, cartão ou transação já
     lançada; editar categoria existente) — recusa curta + orienta a fazer
     no app.
  4. **Ambíguo** — pede a informação que falta, em 1 frase, sem inventar.
* **Fallback determinístico** (`buildFallbackAnswer`) — só cobre o caso
  "pergunta financeira" com os números-chave do mês; falha da IA (sem
  `GEMINI_API_KEY`, timeout, JSON inválido) numa pergunta de
  capacidade/fora-de-escopo ainda responde esse fallback genérico (nunca fica
  mudo, mas não é o ideal — baixíssima frequência, aceito por ora).
* **Roteamento** (`handlers.ts`, `handleFreeformEntry`/`handleVoiceEntry`) —
  `intent="ask"` E o ramo `!ai.isTransaction` (mensagem que a IA classificou
  como `unknown`, sem cair em nenhuma intent fechada) desviam pro
  responder inteligente. `resultCode: "ask_answered"` nos dois casos.
  `buildUnknownReply` (resposta seca de sempre) fica órfã nesse caminho —
  continua usada só quando a IA classificou `intent="query"`/`"invest"`/
  `"create_category"` mas não preencheu o objeto correspondente (situação
  inconsistente rara) e no caminho `ai === null` (fallback determinístico sem
  IA disponível, que não pode chamar `answerQuestion` — sem Gemini
  disponível o `ask` também falharia).

---

# Criar categoria pelo Telegram

`intent="create_category"` (`ai-parser.ts`) + `modules/telegram/category.ts`,
`handleCreateCategory` — orquestra `categoryService.createCategory`
(`modules/categories/service.ts`), sem lógica de domínio nova no bot (regra
de ouro, docs/99-CLAUDE.md).

```text
cria categoria academia
cria categoria pedágio dentro de transporte
```

* **Sem pai citado** ("cria categoria X") → categoria **PAI** top-level
  (`parentId=null`), sempre `type=EXPENSE` — v1 não cria categoria de receita
  via bot (se precisar de INCOME top-level, crie no app).
* **Com pai citado** ("cria categoria X dentro de/em Y") → categoria
  **FILHA** de `Y`, herdando o `type` de `Y` (mesma invariante de
  docs/24-CATEGORIES.md, "Regra de Tipo" — `Y` pode ser EXPENSE OU INCOME).
  `Y` é resolvido por nome EXATO normalizado contra as categorias REAIS do
  usuário (`resolve.ts`, `matchCategoryByName`, busca nos dois tipos) — SEM
  fallback "contém": nome levemente diferente do cadastrado (typo,
  abreviação) responde "não encontrei o pai", nunca cria sob um pai errado
  por engano.
* **Duplicidade** — regra NOVA só do bot (o app web não valida isso hoje,
  não há `@@unique` de nome no Prisma): antes de criar, o handler checa se já
  existe uma categoria com o MESMO nome normalizado, mesmo `parentId`, mesmo
  `type` — se sim, responde que já existe em vez de criar uma segunda
  silenciosamente.
* **Sem ícone/cor via bot** — categoria nasce com `icon=null`/`color=null`
  (defaults do service); o usuário ajusta no app se quiser.
* Erros de domínio (`CategoryParentTypeMismatchError` etc., ver
  `modules/categories/errors.ts`) viram resposta amigável genérica
  (`buildErrorReply`), nunca throw cru — o handler sempre passa
  `type: parent.type` ao criar a filha, então esse erro específico não
  deveria disparar na prática.

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
* **Cancelamento** — responder `cancelar` (case/acento-insensível) **ou**
  tocar o botão Cancelar no teclado inline apaga o pending e confirma, sem
  criar nada.
* **Merge da resposta** — `modules/telegram/pending-merge.ts`,
  `mergeReplyIntoDraft`. DETERMINÍSTICO (sem 2ª chamada à IA — resposta curta,
  vocabulário fixo, custo/latência de IA não compensam aqui):
  * `missingField="amount"` — extrai o primeiro número da resposta (ex.: "30",
    "foi 30", "R$ 30,50"). Só texto (botões não ajudam pra valor livre).
  * `missingField="origin"` — texto ("crédito"/"pix Nubank" etc.) **ou**
    botão inline da conta/cartão (`callback.ts`, `po:a:{id}` / `po:c:{id}`).
* **Rodadas** — cada pergunta incrementa `attempts`; depois de ~3 rodadas sem
  resolver, o bot desiste (apaga o pending, pede pra reenviar a mensagem
  completa) em vez de perguntar pra sempre.
* **Conclusão** — draft completo cria a transação (mesma regra de `isPaid`,
  mesma tag "Telegram") e apaga o pending; a confirmação traz teclado pós-save
  (ver "Botões inline").

---

# Botões inline (fluxo híbrido médio)

O webhook aceita `callback_query` além de `message` (`app/api/telegram/route.ts`).
Mesma auth (secret no header) e allowlist de chat; sempre
`answerCallbackQuery` pra tirar o loading do botão. Ownership da transação /
pending é revalidada pelo `userId` do secret — `callback_data` só carrega ids
(≤ 64 bytes). Implementação: `modules/telegram/inline-keyboard.ts`,
`callback.ts`, `telegram-api.ts` (`sendMessage` com `reply_markup`,
`editMessageText`, `answerCallbackQuery`).

**Híbrido:**

* Draft **completo** (caminho IA texto ou foto) → cria a transação e anexa
  teclado: `Desfazer` | `Trocar categoria` | `Trocar origem`.
  * Desfazer → soft-delete (`transactionService.deleteTransaction`) + edita a
    mensagem pra "Lançamento desfeito" e remove o teclado.
  * Trocar categoria / origem → edita a mensagem com lista clicável; ao
    escolher, `updateTransaction` e reedita a confirmação com o teclado médio
    de novo. « Voltar» restaura o teclado médio sem mutar.
* Draft **incompleto** (falta origem) → pergunta em texto **+** botões das
  contas/cartões ativos (+ Cancelar). Resposta em texto continua válida.
* Falta **valor** → só texto ("Quanto foi?").
* Fallback **regex** (`mercado 120` sem IA) → cria direto **sem** teclado
  nesta versão (atalho de 5 segundos intacto).

`CommandResult.replyMarkup` opcional carrega o teclado; o route envia ou edita
conforme o update.

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

## Consulta de investimentos

Via IA (`intent=query`, `queryType=investments`) — lista nome, % CDI, posição
e total investido:

```text
quais meus investimentos
meus investimentos
quanto tenho investido
```

---

## Aporte em investimento

Via IA (`intent=invest`) — debita a conta (teto = saldo) e sobe a posição do
Asset INVESTMENT (docs/28-INVESTMENTS.md). Conta omitida → conta ativa default.
Categoria fixa: `Investimento (aporte)`.

```text
investi 100 no Cofrinho Nubank
aportei 200 no CDB
coloquei 50 no cofrinho pela conta Nubank
```

Saldo insuficiente → erro explícito com disponível vs tentativa (não cria
lançamento).

---

## Criar categoria

Via IA (`intent=create_category`) — ver "Criar categoria pelo Telegram"
acima.

```text
cria categoria academia
cria categoria pedágio dentro de transporte
```

---

## Pergunta livre / o que o bot faz

Qualquer mensagem que não é lançamento, consulta, aporte nem criação de
categoria cai no responder inteligente (ver "Responder inteligente" acima) —
o bot nunca responde só "não entendi".

```text
o que você faz?
por que gastei mais em maio?
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

Confirmação pós-save no caminho IA/foto traz botões inline (Desfazer /
Trocar categoria / Trocar origem) — ver "Botões inline". Fallback regex
continua sem teclado.

---

## Pergunta de info faltante

```text id="p9v3qp"
⚠️ Quanto foi?
```

```text id="o5k1qp"
⚠️ De onde saiu?
Responda com o cartão ou conta (ex.: crédito Nubank, pix Carteira).
```

Na pergunta de origem, o bot também anexa botões inline das contas/cartões
ativos (e Cancelar). Ver "Botões inline" e "Fluxo conversacional" acima.

---

## Pós-save (teclado médio)

Após criar via IA/foto, a confirmação traz:

`Desfazer` | `Trocar categoria` | `Trocar origem`

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

# Confiabilidade

**Dedup por `update_id`** — o Telegram reenvia o MESMO update se não receber
`200` a tempo (download de foto/voz + Gemini + `createTransaction` rodam
síncronos abaixo e podem passar do timeout dele). Tabela
`TelegramProcessedUpdate` (`userId` + `updateId`, `@@unique([userId,
updateId])` — ver `03-DATABASE.md`) registra cada update processado;
`modules/telegram/dedup.ts` (`telegramDedupRepository.markProcessed`) roda
no TOPO do webhook, ANTES de qualquer processamento pesado, tanto pra
`message` quanto pra `callback_query`. Reenvio detectado → loga
`chat_id=X -> duplicate_update_skipped` e responde `200` sem reprocessar
(evita transação duplicada).

**Boundary de erro único** — `app/api/telegram/route.ts`, `POST` envolve TODO
o dispatch (`dispatchUpdate`) num try/catch final: nenhum caminho (texto,
foto, voz, documento) pode virar `500` pro Telegram — se virasse, ele
reenviaria o update e, sem o dedup acima já ter marcado esse `update_id`, a
falha se repetiria sem chegar a lugar nenhum. No catch, se o `chat_id` for
conhecido, o bot ainda avisa o usuário (`buildErrorReply`, "Não foi possível
processar sua mensagem agora."). A resposta ao Telegram é SEMPRE `200`,
inclusive nesse caminho de erro e na rejeição silenciosa de chat não
vinculado — os try/catch específicos por caminho (voz, etc.) continuam
valendo, isto é só a rede de segurança final.

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

* notificações de orçamento
* alertas de cartão
* resumo semanal automático (push no Telegram — docs/29 menciona; ainda não
  implementado no código de alerts)
* teclado também no fallback regex (`mercado 120`)
* editar valor/descrição por botão no chat (além do médio atual)
* router genérico de documentos (docs/51-TELEGRAM-DOC-ROUTER.md)
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
