# Telegram: bot nunca fica mudo + responder inteligente + criar categoria

Data: 2026-07-13
Status: design aprovado pelo dono (pt-BR), aguardando implementação.

## Contexto

Investigação confirmou o diagnóstico do dono. Root cause do silêncio:

- `src/app/api/telegram/route.ts:65` — `export const maxDuration = 30`.
- `src/modules/telegram/handlers.ts:177-180` (`handleFreeformEntry`, intent
  `"ask"`) chama `answerQuestion` (`src/modules/telegram/ask.ts:133-146`).
- `ask.ts:137-143` chama `extractStructured("document-text", ...)`
  (`src/lib/ai/extract.ts:35`) — resolve pro registry `document-text`
  (`src/lib/ai/models.ts:15-25`): provider **NVIDIA** `openai/gpt-oss-120b`,
  SEM `opts.timeoutMs` custom (`ask.ts` não passa `opts`).
- `src/lib/ai/nvidia.ts:23` — `DEFAULT_TIMEOUT_MS = 60_000`. `extract.ts:35-56`
  encadeia: 1ª tentativa NVIDIA (60s) → retry NVIDIA (60s) → fallback Gemini
  (`gemini.ts:27`, `REQUEST_TIMEOUT_MS = 8000`, também sem override). Pior caso
  ≈ **128s**, muito acima do `maxDuration=30` do webhook.
- Function serverless morre por timeout de plataforma ANTES do
  `try/catch` final do `route.ts:110-132` rodar — não é uma exception JS, é
  kill externo. Por isso "o catch final nunca roda": não há nada pra capturar,
  o processo é abortado. Confirma o diagnóstico do dono.

Princípio do bot (memory `telegram-design-principle`): rápido/ágil/menos
complexo, IA sempre sugere categoria (troca depois). `docs/30-TELEGRAM.md`
("Ícones padronizados", "Confiabilidade") já estabelece: toda resposta começa
com ✅/❌/⚠️, o bot nunca deve ficar mudo (dedup + boundary de erro único já
cobrem exception — falta cobrir timeout de infra).

---

## Parte A — Bot nunca fica mudo + responder inteligente

### A.1 — Trocar o modelo do `ask.ts`

`answerQuestion` (`ask.ts:133`) para de usar `extractStructured("document-text", ...)`
e passa a usar `callGemini` diretamente — a MESMA infra rápida que
`ai-parser.ts` já usa pro parser de texto/voz (`src/modules/telegram/ai-parser.ts:506`,
`callGemini([...], "text", RESPONSE_SCHEMA, parseFn)`).

Mudanças em `ask.ts`:

- Import: trocar `import { extractStructured } from "@/lib/ai/extract"` por
  `import { callGemini } from "@/lib/ai/gemini"` (mesmo import que
  `ai-parser.ts:3` já reexporta — usar direto de `gemini.ts`, sem passar por
  `ai-parser.ts` pra não acoplar módulos por um detalhe de infra).
- `ASK_RESPONSE_SCHEMA` (`ask.ts:25-29`) está em formato lowercase
  (`JsonSchema` de `lib/ai/types.ts`) — formato de `extractStructured`.
  `callGemini` espera o formato Gemini UPPERCASE (`RESPONSE_SCHEMA` em
  `ai-parser.ts:39-80`, `type: "OBJECT"`). Duas opções:
  1. Reescrever `ASK_RESPONSE_SCHEMA` direto no formato Gemini (simples, só um
     schema de 1 campo — `{ type: "OBJECT", properties: { answer: { type:
     "STRING" } }, required: ["answer"] }`). **Recomendado** — sem
     indireção extra pra um schema trivial (YAGNI, regra 02-dry-kiss-yagni).
  2. Reusar `toGeminiSchema` (`gemini.ts:121`, já exportado) sobre o schema
     lowercase existente. Só compensa se o schema crescer.
- Nova chamada:
  ```ts
  const raw = await callGemini(
    [{ parts: [{ text: buildAskPrompt(numbersText, question) }] }],
    "ask",
    ASK_GEMINI_RESPONSE_SCHEMA,
    parseAskResponse,
    ASK_TIMEOUT_MS,
  );
  ```
- Timeout: `ASK_TIMEOUT_MS = 10_000` (~10s, bem abaixo do `maxDuration=30` —
  sobra folga pro resto do dispatch: dedup, buildAskContext, formatação).
  `callGemini` não tem retry embutido (diferente de `extractStructured`) —
  pior caso vira só ~10s + latência de rede, não 128s.
- `buildAskContext` (`ask.ts:57-85`) e `buildFallbackAnswer` (`ask.ts:122-131`)
  ficam INTACTOS — já são rápidos (queries Postgres, sem IA) e o fallback
  determinístico continua sendo a rede de segurança quando `callGemini`
  retorna `null` (API key ausente, timeout, JSON inválido).
- Resultado: pior caso do caminho `ask` cai de ~128s pra ~10s — o bot NUNCA
  mais mata a function por timeout de infra nesse caminho.

Nenhuma mudança em `extract.ts`/`nvidia.ts`/`models.ts` — o registry
`document-text`/`document-vision` continua servindo quem realmente precisa
(recibo/documento de financiamento), só o `ask.ts` para de usar essa camada.

### A.2 — Prompt do responder ("bot assistant")

Reescrever `buildAskPrompt` (`ask.ts:107-119`) — hoje é só "responda a
pergunta financeira ancorado nos números". Novo prompt cobre 4
comportamentos:

1. **Pergunta financeira** → responde com números do `buildNumbersText`
   (comportamento atual, mantido — nunca inventa valor).
2. **Capacidade** ("o que você faz?", "o que você sabe fazer?") → lista o que
   o bot faz.
3. **Fora de escopo** (editar/apagar transação, mudar categoria de uma
   transação já lançada, editar conta/cartão, deletar investimento etc.) →
   recusa curta + orienta pro app.
4. **Ambíguo** → pede a informação que falta (1 frase, sem inventar).

Blocos de capacidade (fonte única de verdade — usados no prompt, texto
literal, não uma lista dinâmica de features/flags):

```
O bot FAZ:
- lançar gasto ou receita (ex.: "mercado 120", "recebi 500 de freela")
- consultar saldo, gastos do mês, resumo de hoje, top categorias, fatura de cartão
- registrar aporte em investimento (ex.: "investi 100 no Cofrinho Nubank")
- ler foto de recibo/comprovante/notificação e PDF de contrato de financiamento
- criar categoria nova (ex.: "cria categoria academia", "cria categoria pedágio dentro de transporte")

O bot NÃO FAZ (oriente a fazer no app):
- editar ou apagar conta, cartão ou transação já lançada
- editar categoria existente (renomear, mudar ícone/cor, mover de pai)
- gerar relatórios/gráficos (isso é o Dashboard/`/reports` do app)
```

Regra de resposta (reforça o que já existe em `ask.ts:110-111`, "NUNCA
invente"): pergunta financeira cujo dado não está no `numbersText` → dizer
honestamente que não tem esse dado, nunca estimar.

Implementação: função `buildAskPrompt` recebe os mesmos `numbersText`/
`question` de hoje; o texto de capacidade vira uma constante
`BOT_CAPABILITIES_BLOCK` no topo do arquivo, interpolada no prompt. Sem
lógica condicional nova em código — a CLASSIFICAÇÃO dos 4 casos acima é feita
pelo próprio Gemini dentro de UM único prompt/chamada (mesmo padrão de
`ai-parser.ts`, que já classifica `intent` numa única chamada) — sem 2ª
chamada de "classificar antes de responder" (custo/latência não compensam
pra pergunta livre de baixo volume, mesma razão já documentada em
`docs/30-TELEGRAM.md` pra não fazer 2ª chamada de IA no merge de pending).

`buildFallbackAnswer` (determinístico, sem IA) continua só cobrindo o caso
"pergunta financeira" com os números-chave — os casos 2/3/4 acima SÓ existem
quando o Gemini responde (são comportamento conversacional, não dado
determinístico). Se `callGemini` falhar numa pergunta de capacidade/fora de
escopo, o fallback atual ("não consegui gerar resposta, mas aqui vão os
números") ainda é aceitável (nunca fica mudo) — não é o caso ideal, mas está
fora do escopo desta rodada tratar isso com um 2º fallback determinístico
pra capacidade (YAGNI: baixíssima frequência, o filtro de intent="ask" já é
estreito).

### A.3 — Roteamento (`handlers.ts`)

Estado atual (`handlers.ts:147-187`, `handleFreeformEntry`):

```
pending ativo → handlePendingReply
IA null → fallback (create_transaction ou buildUnknownReply)
intent="query" → executeTelegramQuery
intent="invest" → handleInvestContribution
intent="ask" → answerQuestion (JÁ cai no responder)
!isTransaction → buildUnknownReply   ← SECO, precisa mudar
isTransaction → processDraft
```

O caminho seco é `!ai.isTransaction` (linha 182-184) quando `intent` é
`"unknown"` (ou ausente + `isTransaction=false`) — isso inclui saudação,
ruído, mensagem fora de escopo que a IA classificou como `unknown`. Mudança:

```ts
if (!ai.isTransaction) {
  const text = await answerQuestion(userId, rawText);
  return { text, resultCode: "ask_answered" };
}
```

Ou seja: remover o `return { text: buildUnknownReply(), resultCode:
"unknown_message" }` desse ramo (linha 182-184) e desviar pro
`answerQuestion` — o prompt novo (A.2) já cobre "não reconheço isso, veja o
que eu faço" pra mensagem genuinamente sem sentido. `buildUnknownReply`
(`reply.ts:70-77`) fica órfão SÓ neste caminho — continua usado nos ramos
`!ai.query`/`!ai.invest` ausentes (`handlers.ts:167,173` — a IA classificou
`intent="query"`/`"invest"` mas não preencheu o objeto, situação
inconsistente rara, não um "não entendi" de conteúdo) e no caminho de
`ai === null` (fallback determinístico sem IA, linha 161, que não pode
chamar `answerQuestion` — sem Gemini disponível o `ask` também falharia,
mantém a resposta seca de sempre nesse caso).

Mesma mudança em `handleVoiceEntry` (`handlers.ts:403-405`) — hoje também cai
em `buildUnknownReply` quando `!ai.isTransaction`; troca pro mesmo desvio
(`answerQuestion(userId, ai.description)`, já é a fonte de texto usada na
linha 399 pro caminho `intent="ask"` de voz).

Draft flow (`processDraft`/pending, `draft.ts`) e o path
`create_transaction`/`processDraft` ficam INTACTOS — a mudança é só no ramo
final "não é transação" de `handleFreeformEntry`/`handleVoiceEntry`.

### A.4 — Classificador (`ai-parser.ts`) precisa de ajuste?

Não precisa mudar o enum `intent` (`register | query | ask | invest |
unknown`, `ai-parser.ts:56` e `types.ts:78`) nem o schema. `unknown` continua
existindo como classificação (a IA ainda decide "isso não é nada
reconhecível") — só o CONSUMIDOR desse resultado em `handlers.ts` muda de
"resposta seca" pra "manda pro responder inteligente". Nenhuma mudança em
`RESPONSE_SCHEMA`/`aiResponseSchema`/`INTENT_CLASSIFICATION` (`ai-parser.ts`).

A única mudança no parser é a NOVA intent de Parte B (`create_category`, ver
abaixo) — essa sim precisa de schema novo.

### A.5 — Por que isso já resolve "nunca fica mudo"

Com A.1 (timeout ask ~10s) + A.3 (unknown cai no responder, que também tem
seu próprio fallback determinístico), o único caminho de texto livre que
ainda pode se aproximar do timeout de 30s é o parser principal
(`parseTransactionWithAI`, `ai-parser.ts:502-507`) — que já usa `callGemini`
com timeout default de 8s (`gemini.ts:27`, sem override) e SEM retry (só
`extractStructured` tem retry automático). Esse caminho já estava dentro do
orçamento antes desta mudança; não precisa de alteração.

---

## Parte B — Criar categoria pelo Telegram

### B.1 — Decisões do dono (locked)

- `"cria categoria X"` → cria categoria **PAI** (top-level, `parentId=null`),
  `type=EXPENSE`.
- `"cria categoria X dentro de/em Y"` → cria **FILHA** `X` sob o pai `Y`. `Y`
  precisa existir (categoria real do usuário); filha HERDA o `type` de `Y`
  (mesma invariante de `docs/24-CATEGORIES.md`, "Regra de Tipo": "filha nunca
  diverge do type do pai" — já validado em código por
  `categoryService.createCategory`, `service.ts:80-90`,
  `CategoryParentTypeMismatchError`).

### B.2 — Camada de domínio (`categories/`) — o que já existe

- `categoryService.createCategory(userId, { name, type, parentId?, icon?,
  color? })` (`service.ts:80-90`) já valida: pai existe
  (`CategoryParentNotFoundError`) e pai tem o mesmo `type`
  (`CategoryParentTypeMismatchError`) — cobre a herança de `type` da filha
  automaticamente (o handler do Telegram só precisa passar `type: parent.type`
  ao criar a filha).
- **Sem verificação de nome duplicado** — nem em `service.ts` nem em
  `repository.ts` (`create`, `repository.ts:38-49`), nem constraint
  `@@unique` no Prisma (`schema.prisma:308-329`, só há
  `@@index([userId, parentId])`). Confirmado: hoje o app permite 2
  categorias com o mesmo nome sob o mesmo pai — não existe
  `CategoryDuplicateError` em `errors.ts`. **Decisão de escopo**: não mudar
  esse comportamento pro app inteiro (fora de escopo, app web já convive com
  isso) — o handler do Telegram faz SEU PRÓPRIO check de duplicidade (nome
  normalizado igual, mesmo `parentId`, mesmo `type`) ANTES de chamar
  `createCategory`, só pra dar uma resposta amigável em vez de criar
  silenciosamente uma segunda "Pedágio" dentro de "Transporte". Reusa
  `categoryService.listTree` + `normalizeWord` (mesmo padrão de
  `resolve.ts:112-133`, `resolveCategoryByName`).

### B.3 — Novo intent no parser (`ai-parser.ts`)

Adicionar `"create_category"` ao enum `TelegramIntent` (`types.ts:78`):

```ts
export type TelegramIntent = "register" | "query" | "ask" | "invest" | "create_category" | "unknown";
```

Novo campo estruturado (mesmo padrão de `TelegramInvestParsed`,
`types.ts:111-115`):

```ts
export type TelegramCreateCategoryParsed = {
  categoryName: string | null;
  parentName: string | null;
};
```

`AiParsedTransaction` (`types.ts:156-170`) ganha
`createCategory?: TelegramCreateCategoryParsed | null`.

`RESPONSE_SCHEMA` (`ai-parser.ts:39-80`) ganha:
- `intent` enum inclui `"create_category"`.
- Novo objeto `createCategory: { type: "OBJECT", nullable: true, properties:
  { categoryName: {type:"STRING", nullable:true}, parentName: {type:"STRING",
  nullable:true} }, required: [] }`.

`aiResponseSchema`/`imageTransactionItemSchema` zod (`ai-parser.ts:96-111`):
novo `createCategorySchema = z.object({ categoryName: z.string().nullable().optional(),
parentName: z.string().nullable().optional() })`, adicionar
`createCategory: createCategorySchema.nullable().optional()` em
`aiResponseSchema`. `parseAiTransactionResponse` (`ai-parser.ts:461-492`)
mapeia o campo novo igual a `invest`.

`INTENT_CLASSIFICATION` (`ai-parser.ts:268-281`) ganha uma nova entrada:

```
- "create_category": o usuário quer CRIAR uma categoria nova — ex.: "cria
  categoria pedágio", "cria a categoria pedágio dentro de transporte", "cria
  categoria academia em saúde". Preencha createCategory={categoryName,
  parentName}. parentName=null quando o usuário não citar "dentro de"/"em"
  <categoria pai> — nesse caso a categoria criada é PAI (top-level, EXPENSE).
  Quando citar, parentName = nome do pai como o usuário escreveu (a
  resolução contra as categorias REAIS do usuário acontece fora da IA, ver
  resolve.ts). NÃO INVENTE parentName se o usuário não mencionou nenhum pai.
```

`buildPrompt`/`buildVoicePrompt` (que já compartilham `INTENT_CLASSIFICATION`)
ganham essa regra automaticamente — sem prompt novo. Imagem
(`buildImagePrompt`) NÃO ganha essa intent (criar categoria por foto não faz
sentido, fora de escopo, mesma razão de imagem não classificar `intent` hoje).

### B.4 — Handler novo: `src/modules/telegram/category.ts`

Novo módulo (mesmo padrão de `invest.ts` — SRP, um arquivo por intent
"de ação" fora do fluxo de lançamento):

```ts
import { CategoryType } from "@/generated/prisma/enums";
import { categoryService } from "@/modules/categories/service";
import { CategoryDomainError } from "@/modules/categories/errors";
import { normalizeWord } from "./normalize";
import {
  buildCategoryCreatedReply,
  buildCategoryDuplicateReply,
  buildCategoryNeedNameReply,
  buildCategoryParentNotFoundReply,
  buildErrorReply,
} from "./reply";
import type { CommandResult, TelegramCreateCategoryParsed } from "./types";

async function findExistingByName(
  userId: string,
  name: string,
  parentId: string | null,
  type: CategoryType,
): Promise<boolean> { /* categoryService.listTree + normalizeWord, mesmo parentId/type */ }

export async function handleCreateCategory(
  userId: string,
  input: TelegramCreateCategoryParsed,
): Promise<CommandResult> {
  if (!input.categoryName) {
    return { text: buildCategoryNeedNameReply(), resultCode: "create_category_need_name" };
  }

  if (!input.parentName) {
    // top-level, EXPENSE (decisão do dono — B.1)
    const duplicate = await findExistingByName(userId, input.categoryName, null, CategoryType.EXPENSE);
    if (duplicate) return { text: buildCategoryDuplicateReply(input.categoryName), resultCode: "create_category_duplicate" };

    const category = await categoryService.createCategory(userId, {
      name: input.categoryName,
      type: CategoryType.EXPENSE,
    });
    return { text: buildCategoryCreatedReply(category.name, null), resultCode: "create_category_created" };
  }

  // resolve pai por nome (reusa matching normalizado — ver B.5)
  const parent = await matchCategoryByName(userId, input.parentName);
  if (!parent) {
    return { text: buildCategoryParentNotFoundReply(input.parentName), resultCode: "create_category_parent_not_found" };
  }

  const duplicate = await findExistingByName(userId, input.categoryName, parent.id, parent.type);
  if (duplicate) return { text: buildCategoryDuplicateReply(input.categoryName), resultCode: "create_category_duplicate" };

  try {
    const category = await categoryService.createCategory(userId, {
      name: input.categoryName,
      type: parent.type, // herda do pai
      parentId: parent.id,
    });
    return { text: buildCategoryCreatedReply(category.name, parent.name), resultCode: "create_category_created" };
  } catch (error) {
    if (error instanceof CategoryDomainError) {
      return { text: buildErrorReply(error.message), resultCode: "create_category_error" };
    }
    throw error;
  }
}
```

Domain logic (validação de pai/tipo, criação) continua 100% em
`categoryService` (`docs/99-CLAUDE.md`, "Regra de Ouro") — o handler só
orquestra: resolve nomes → chama o service → formata resposta. Erros de
domínio (`CategoryParentTypeMismatchError` não deveria disparar aqui, já que
o handler sempre passa `type=parent.type`; mas fica coberto por segurança —
erro-como-dado, `~/.claude/rules/06-composition-errors.md`) viram
`buildErrorReply` genérica, nunca throw cru.

### B.5 — Resolução do pai por nome

Reusar o padrão de matching já usado por `resolve.ts` em vez de duplicar
lógica (regra DRY, 3+ ocorrências já existem: `resolveCategoryByName`,
`matchExpenseCategoryByName`, `matchInvestmentByName` — todas fazem "match
exato normalizado, sem fallback inventado"). Adicionar em `resolve.ts`:

```ts
/** Resolve categoria PAI por nome pra criar filha via Telegram (Parte B) — busca em AMBOS os tipos (EXPENSE/INCOME), match exato normalizado, sem fallback. `null` se não achar. */
export async function matchCategoryByName(
  userId: string,
  name: string,
): Promise<{ id: string; name: string; type: CategoryType } | null> {
  const tree = await categoryService.listTree(userId);
  const categories = flattenTree(tree);
  const normalizedTarget = normalizeWord(name);
  const match = categories.find((category) => normalizeWord(category.name) === normalizedTarget);
  return match ? { id: match.id, name: match.name, type: match.type } : null;
}
```

DIFERENTE de `matchExpenseCategoryByName` (`resolve.ts:146-156`, restrito a
EXPENSE pra consulta) — aqui busca nos DOIS tipos porque o pai citado pode
ser INCOME (ex.: "cria categoria bônus dentro de salário"). Sem "contém"
fallback (diferente de `matchInvestmentByName`) — nome de categoria pai
deveria ser citado com precisão razoável; ambiguidade por "contém" arrisca
criar filha sob o pai errado (custo de engano mais alto que investimento).
Assumption a confirmar com o dono (ver abaixo).

### B.6 — Roteamento (`handlers.ts`)

Em `handleFreeformEntry` (e espelhado em `handleVoiceEntry`), novo ramo ANTES
do `intent === "ask"` (ordem não importa entre si, mas depois de
`query`/`invest`, mesmo padrão dos demais):

```ts
if (intent === "create_category") {
  if (!ai.createCategory) return { text: buildUnknownReply(), resultCode: "unknown_message" };
  return handleCreateCategory(userId, ai.createCategory);
}
```

`buildAiContext`/`buildAskContext` não precisam mudar — criar categoria não
depende de listas de contas/cartões/investimentos, só do nome citado (a IA
não precisa da lista de categorias existentes pra ESSA intent — resolução
acontece depois, em código, via `matchCategoryByName`).

### B.7 — Mensagens novas (`reply.ts`)

```ts
export function buildCategoryCreatedReply(name: string, parentName: string | null): string {
  return parentName
    ? `${ICON_SUCCESS} Categoria "${name}" criada dentro de "${parentName}".`
    : `${ICON_SUCCESS} Categoria "${name}" criada.`;
}

export function buildCategoryNeedNameReply(): string {
  return `${ICON_WARNING} Qual o nome da categoria? Ex.: "cria categoria academia" ou "cria categoria pedágio dentro de transporte".`;
}

export function buildCategoryParentNotFoundReply(parentName: string): string {
  return [
    `${ICON_WARNING} Não encontrei a categoria "${parentName}".`,
    "Crie o pai primeiro no app, ou confira o nome exato em Categorias.",
  ].join("\n");
}

export function buildCategoryDuplicateReply(name: string): string {
  return `${ICON_WARNING} Já existe uma categoria "${name}" aí. Use outro nome ou edite a existente no app.`;
}
```

Ícones seguem a convenção existente (`docs/30-TELEGRAM.md`, "Ícones
padronizados") — sucesso ✅, precisa de info ⚠️ (nome faltando/pai não
encontrado/duplicada NÃO são erro de sistema, são "faltou dado" ou "estado
inesperado que o usuário pode corrigir").

### B.8 — Também mencionar no responder inteligente

O bloco `BOT_CAPABILITIES_BLOCK` (A.2) já lista "criar categoria nova" — sem
trabalho extra de integração entre Parte A e Parte B além de manter essa
linha atualizada.

---

## Premissas a confirmar com o dono

1. **Top-level sempre EXPENSE** — criar categoria de receita (INCOME)
   top-level via bot não é coberto nesta v1 (ex.: "cria categoria bônus" vira
   EXPENSE, mesmo que o usuário quisesse INCOME). Se o dono quiser INCOME
   também, precisa de uma palavra-chave/heurística nova (ex.: "cria categoria
   de receita X") — YAGNI até ter um caso real.
2. **Match de pai é só EXATO normalizado** (sem fuzzy "contém") — nome
   levemente diferente do cadastrado (typo, abreviação) devolve "não
   encontrei", nunca uma criação por engano sob pai errado. Trade-off:
   pode frustrar se o usuário digitar "transport" em vez de "Transporte".
3. **Sem ícone/cor via bot** — categoria criada pelo Telegram nasce com
   `icon=null`/`color=null` (defaults do schema/service). Usuário ajusta no
   app depois, se quiser.
4. **Duplicidade é uma regra NOVA só do bot** (a UI web não valida isso
   hoje) — confirmar que o dono não quer estender a mesma validação pro
   `categoryService.createCategory` globalmente (mudaria comportamento do
   app inteiro, fora do pedido original).
5. **`intent="create_category"` compete com `"register"`** em mensagens
   ambíguas tipo "criei uma categoria de gasto de 50" (tem número!) — o
   prompt pede pra IA priorizar `create_category` quando o verbo é
   "criar categoria" explicitamente; vale revisar com exemplos reais depois
   do primeiro uso (não dá pra testar todos os casos de ambiguidade só no
   design).

---

## Plano de implementação (ordem sugerida)

1. **`ask.ts`** — trocar `extractStructured` por `callGemini` direto (A.1),
   schema Gemini UPPERCASE, timeout 10s. Sem mudança de assinatura pública
   (`answerQuestion(userId, question)` continua igual).
2. **`ask.ts`** — reescrever `buildAskPrompt` com `BOT_CAPABILITIES_BLOCK` +
   os 4 comportamentos (A.2).
3. **`handlers.ts`** — `handleFreeformEntry`/`handleVoiceEntry`: ramo
   `!ai.isTransaction` desvia pro `answerQuestion` em vez de
   `buildUnknownReply` (A.3).
4. Rodar `vitest` dos arquivos existentes (`handlers.test.ts`,
   `ai-parser.test.ts`) pra garantir zero regressão nesse ponto antes de
   seguir pra Parte B.
5. **`types.ts`** — `TelegramIntent` ganha `"create_category"`;
   `TelegramCreateCategoryParsed`; `AiParsedTransaction.createCategory`
   (B.3).
6. **`ai-parser.ts`** — `RESPONSE_SCHEMA` + `aiResponseSchema` +
   `parseAiTransactionResponse` + `INTENT_CLASSIFICATION` (nova regra de
   `create_category`) (B.3).
7. **`resolve.ts`** — novo `matchCategoryByName` (B.5).
8. **`reply.ts`** — 4 mensagens novas (B.7).
9. **Novo `category.ts`** — `handleCreateCategory` (B.4).
10. **`handlers.ts`** — novo ramo `intent === "create_category"` em
    `handleFreeformEntry` (e espelhar em `handleVoiceEntry`) (B.6).
11. **`docs/30-TELEGRAM.md`** — documentar a nova intent/comando (seção
    "Comandos" + "Parsing por IA"), documentar o novo comportamento do
    responder (`ask`), atualizar "Evolução Futura" removendo o que virou
    realidade.

---

## Plano de testes (vitest)

Arquivos existentes seguem o padrão de mock (`vi.mock("@/lib/ai/gemini")`
ou `vi.mock("@/lib/ai/extract")` + `await import(...)` depois do mock —
ver `ai-parser.test.ts:1-8`).

### `ask.test.ts` (novo)

- Mock `callGemini` (não `extractStructured`) — asserta que `answerQuestion`
  chama com `source="ask"` (ou nome escolhido), o schema Gemini novo e
  `timeoutMs=10000`.
- `callGemini` retorna `{ answer: "..." }` → `answerQuestion` devolve esse
  texto.
- `callGemini` retorna `null` → `answerQuestion` cai no
  `buildFallbackAnswer` (asserta que contém `formatBRL` dos números do mês,
  mesmo teste que já seria óbvio hoje mas não existe ainda — cobrir).
- Prompt gerado contém o bloco de capacidades (assert `toContain` num trecho
  fixo do `BOT_CAPABILITIES_BLOCK`).

### `ai-parser.test.ts` (estender)

- Novo `describe("parseTransactionWithAI — create_category")`: resposta
  simulada com `intent: "create_category"`, `createCategory: {categoryName,
  parentName}` → `parseAiTransactionResponse` mapeia corretamente (mesmo
  padrão dos testes de `invest`/`query` já existentes, se houver — conferir
  o arquivo atual pra replicar exatamente o estilo).

### `handlers.test.ts` (estender)

- `!ai.isTransaction` (intent ausente ou `"unknown"`) → chama
  `answerQuestion` (mock) em vez de `buildUnknownReply` — assert
  `resultCode: "ask_answered"`.
- `intent: "create_category"` com `createCategory` preenchido → delega pra
  `handleCreateCategory` (mock do módulo novo) e devolve o resultado direto.
- `intent: "create_category"` sem `ai.createCategory` (inconsistente) →
  `buildUnknownReply`/`unknown_message` (mesmo padrão de `query`/`invest`
  ausentes).
- Repetir os 2 casos acima em `handleVoiceEntry`.

### `category.test.ts` (novo, para `category.ts`)

Mock `categoryService.createCategory`/`categoryService.listTree` (ou mock
`resolve.ts`'s `matchCategoryByName` direto, mais isolado):

- Sem `parentName` → cria com `type: EXPENSE`, `parentId` ausente;
  `resultCode: "create_category_created"`.
- Com `parentName` resolvendo pra uma categoria EXPENSE existente → cria
  filha com `type` herdado, `parentId` do pai.
- Com `parentName` resolvendo pra uma categoria INCOME → filha herda
  `INCOME` (cobre a regra "herda o type do pai" além do caso EXPENSE
  default).
- `parentName` que não bate com nenhuma categoria real →
  `buildCategoryParentNotFoundReply`, `resultCode:
  "create_category_parent_not_found"`, SEM chamar `createCategory`.
- Nome duplicado sob o mesmo pai (ou top-level) →
  `buildCategoryDuplicateReply`, SEM chamar `createCategory` (assert mock não
  chamado).
- `categoryName` ausente → `buildCategoryNeedNameReply`, sem tocar o service.
- `categoryService.createCategory` lança `CategoryDomainError` inesperado →
  `buildErrorReply(error.message)`, não propaga.

### Regressão

Rodar toda a suíte de `src/modules/telegram/*.test.ts` (`handlers.test.ts`,
`ai-parser.test.ts`, `pending-merge.test.ts`, `resolve.test.ts`,
`parser.test.ts`, `financing-parser.test.ts`) — Parte A/B não deveriam tocar
o fluxo de `create_transaction`/draft/pending, mas o roteamento em
`handlers.ts` é compartilhado, então vale confirmar zero quebra.
