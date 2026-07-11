# Import de documentos financeiros (NVIDIA NIM) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to
> execute this plan. Do not implement directly — dispatch each task to a subagent, review its
> diff, run the verification commands yourself before marking the task done, then move to the
> next task. Steps use checkbox (`- [ ]`) syntax; check them off only after the command in that
> step actually ran and produced the expected output.

## Goal

Dois fluxos de ingestão de documento por IA, atrás de uma camada de IA
provider-agnóstica (NVIDIA NIM primário, Gemini opcional):

1. **Fatura de cartão** (PDF, inclusive com senha) → lançamentos gravados dentro do
   cartão (`cardId` set, `accountId=null`, `isPaid=true`), reusando/generalizando o
   pipeline de import de extrato hoje preso a conta.
2. **Contrato de financiamento** (CCB) → `parseFinancingFromDocument` passa a usar a
   mesma camada de IA + extração de texto/senha, continua só pré-preenchendo o form.

Base: `docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md` (spec
aprovado — leia antes de executar qualquer tarefa).

## Architecture

```
src/lib/pdf/
  extract-text.ts        # extractPdfText(bytes, password?) -> {text, hasTextLayer}; PdfPasswordError
src/lib/ai/
  types.ts                # ExtractionInput, JsonSchema, ExtractOpts, AiModelConfig (+ fallback?), StructuredExtractor (porta)
  models.ts                # REGISTRY: AiRole -> AiModelConfig (fonte única do modelo/provider primário + fallback opcional)
  nvidia.ts                 # NvidiaNimExtractor implements StructuredExtractor
  gemini.ts                  # callGemini (mantido) + GeminiExtractor implements StructuredExtractor (fallback de provider)
  extract.ts                  # extractStructured(role, input, prompt, schema, parse, opts) — facade: primário -> retry -> fallback -> null
src/modules/imports/
  types.ts                # + ImportTarget
  repository.ts             # findExistingFitIds/findFallbackRows/insertMany generalizados por target
  service.ts                  # previewImport/commitImport generalizados por target + password
  schemas.ts                    # importTargetSchema
  actions.ts                      # previewImportAction/commitImportAction por target
  errors.ts                # + CardNotFoundError
  parsers/
    normalize.ts           # extraído de pdf-parser.ts — schema/normalize/erro-como-dado compartilhado
    pdf-parser.ts             # refatorado pra usar normalize.ts (comportamento inalterado)
    card-invoice-parser.ts      # NOVO — parseCardInvoice(bytes, password?)
    index.ts                       # parseImportFile roteia PDF de cartão pro parser novo
src/modules/telegram/
  financing-parser.ts     # parseFinancingFromDocument refatorado pra extractPdfText + extractStructured
src/components/imports/    # NOVO — movido/generalizado de components/accounts/import-*
  password-protected-file-field.tsx  # NOVO — componente compartilhado (fatura + contrato)
  import-modal.tsx, import-dropzone.tsx, import-file-row.tsx, import-file-utils.ts,
  import-motion.ts, import-preview.tsx, import-preview-panel.tsx, import-result.tsx,
  import-stepper.tsx, import-types.ts, use-import-files.ts
src/components/accounts/import-button.tsx    # wrapper fino, target={kind:"account"}
src/components/cards/card-import-button.tsx  # NOVO — wrapper fino, target={kind:"card"}
src/components/financings/financing-import-button.tsx  # passa a usar PasswordProtectedFileField
```

## Tech Stack

Next.js 16 (App Router) · TypeScript · Prisma 7 (Postgres) · Zod 4 · Vitest 4 ·
`unpdf` (extração de texto de PDF, build serverless de pdfjs — sem binário nativo, roda
na Vercel) · NVIDIA NIM (`https://integrate.api.nvidia.com/v1/chat/completions`,
OpenAI-compatible) via `fetch` nativo, sem SDK · Gemini via `fetch` nativo (já existente,
`src/lib/ai/gemini.ts`).

## Global Constraints

Estes invariantes valem para TODAS as tarefas abaixo — releia antes de cada uma:

- **thinking/reasoning OFF por padrão em TODOS os roles, sem exceção** — inclusive
  contrato de financiamento (T13 usa `role: "document-text"`, deepseek com
  `thinking:false`, o MESMO role da fatura). `document-text-reasoning` (nemotron +
  `reasoning_budget`) existe no registry mas é um **upgrade manual, opt-in**, aplicado só
  depois de medição concreta mostrar confusão de campo (`principal`/`assetValue`/
  `downPayment`) — nunca o default de nenhum parser. Decisão explícita do dono: "ligar
  SÓ por medição", não por suposição de que o documento é "complexo".
- **Gemini nunca é desabilitado — é FALLBACK de provider**, não um caminho morto. O
  facade (`extractStructured`, T7) tenta o provider primário do registry (NVIDIA); se
  vier `null` (rate limit, timeout, JSON fora do shape), tenta o `GeminiExtractor` antes
  de devolver `null` pro parser. Cada `role` com fallback configurado é decidido no
  registry (`AiModelConfig.fallback`), nunca hardcoded num parser.
- **Erro-como-dado**: todo adapter de IA (`StructuredExtractor.extract`) **nunca lança** —
  falha vira `null`, sempre. Erros de domínio conhecidos (senha errada, ownership) usam
  classes tipadas (`~/.claude/rules/06-composition-errors.md`), nunca `throw` genérico.
- **Nunca logar** conteúdo de documento, senha, nem API key — em nenhum `console.error`,
  em nenhum log, em nenhuma mensagem de erro devolvida ao usuário.
- **`NVIDIA_API_KEY` só em env** (`.env` local + Vercel) — nunca hardcoded, nunca em
  commit, nunca impresso em log/script. Placeholder já existe em `.env.example`.
- **Fixtures de PDF real NUNCA commitadas** — o repo é PÚBLICO
  (`githubRepoVisibility public`). Os 2 PDFs financeiros reais usados em T1/T10
  (`src/lib/pdf/__fixtures__/*.pdf`) ficam SÓ no disco local do dev, cobertos por
  `.gitignore` desde o primeiro passo de T1 — nenhum passo deste plano faz `git add`
  neles, em nenhuma tarefa.
- **Dedup de fatura de cartão = `(data, valor)`** no `cardId` (sem descrição — diferente
  do dedup de conta, que é `(data, valor, descrição)`).
- **Parcela de fatura = gasto flat** — 1 linha de parcela no PDF = 1 `Transaction`
  EXPENSE isolada. Agrupar num `InstallmentPurchase` é fase 2, fora deste plano.
- **deepseek é text-only** — PDF com text layer → extrai TEXTO → `role: "document-text"`
  (deepseek). PDF escaneado/foto (sem text layer) → `role: "document-vision"` (qwen).
- **Provider/model só no registry** (`src/lib/ai/models.ts`) — nenhum parser (`card-invoice-parser.ts`,
  `financing-parser.ts`) importa `nvidia.ts`/`gemini.ts` diretamente; todos passam por
  `extractStructured(role, ...)`. Trocar modelo, ou o provider de fallback, = editar
  `models.ts`, nunca um parser.

## Task Order

- Fase 0 — Spike (de-risco): T1, T2
- Fase 1 — Camada de IA reutilizável: T3, T4, T5, T6, T7
- Fase 2 — Fluxo 1 (fatura, pipeline por target): T8, T9, T10, T11, T12
- Fase 3 — Fluxo 2 (contrato de financiamento): T13, T14
- Fase 4 — Frontend: T15, T16, T17
- Fase 5 — Regressão: T18

---

## Fase 0 — Spike (de-risco, ANTES de tudo)

### T1 — Extração de texto de PDF (`extractPdfText`)

Decisão da lib: **`unpdf`** (não `pdfjs-dist` direto). Motivo: `unpdf` embarca um build
serverless do PDF.js (worker inlined, sem canvas/DOM, sem dependência de binário nativo)
pensado justamente pra Vercel/edge/Node serverless — `pdfjs-dist` puro exige mais
configuração manual de worker/polyfills pro mesmo cenário. `unpdf.getDocumentProxy(data,
options)` repassa `options` pro `pdfjs.getDocument` por baixo, então `password` funciona
igual (`DocumentInitParameters.password`). Confirmado lendo `node_modules/unpdf/dist/index.d.ts`
depois de instalar (passo abaixo) — se o subagente achar diferença, documentar no
comentário de topo do arquivo antes de prosseguir.

**Files:**
- Create: `src/lib/pdf/extract-text.ts`
- Create: `src/lib/pdf/extract-text.test.ts`
- Create: `src/lib/pdf/__fixtures__/fatura-com-senha.pdf` (copiado de `/Users/carloshenrique/Downloads/Fatura.pdf`, senha `028574373`)
- Create: `src/lib/pdf/__fixtures__/nubank-sem-senha.pdf` (copiado de `/Users/carloshenrique/Downloads/Nubank_2026-07-08.pdf`)
- Modify: `package.json` (dependência `unpdf`)

**Interfaces:**
- Produces: `extractPdfText(bytes: Buffer, password?: string): Promise<{ text: string; hasTextLayer: boolean }>`
- Produces: `class PdfPasswordError extends Error`

Passos:

- [ ] **1.1 — Instalar `unpdf`.**
  ```bash
  cd /Users/carloshenrique/Documents/PESSOAL/personal-finance && npm install unpdf
  ```
  Verificar que `unpdf` aparece em `dependencies` no `package.json` e que `npm install`
  não quebrou nada (`postinstall` roda `prisma generate` — deve terminar sem erro).

- [ ] **1.2 — `.gitignore` ANTES de tocar em qualquer PDF real** (o repo é PÚBLICO —
  `githubRepoVisibility public` — commitar um documento financeiro real, mesmo dentro de
  `__fixtures__`, vazaria dado pessoal do dono pro mundo; isto NÃO é uma decisão a pedir
  confirmação, é regra fixa deste plano). Adicionar ao `.gitignore` da raiz do projeto:
  ```
  # Fixtures de PDF real (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T1)
  # — documentos financeiros pessoais do dono, NUNCA commitados (repo público).
  src/lib/pdf/__fixtures__/
  ```
  ```bash
  git add .gitignore
  git commit -m "chore(pdf): gitignore de fixtures de PDF real (documento financeiro pessoal, repo público)"
  ```

- [ ] **1.3 — Copiar as 2 fixtures reais (só no disco local — já cobertas pelo
  `.gitignore` do passo anterior, `git status` não deve listá-las).**
  ```bash
  mkdir -p /Users/carloshenrique/Documents/PESSOAL/personal-finance/src/lib/pdf/__fixtures__
  cp "/Users/carloshenrique/Downloads/Fatura.pdf" /Users/carloshenrique/Documents/PESSOAL/personal-finance/src/lib/pdf/__fixtures__/fatura-com-senha.pdf
  cp "/Users/carloshenrique/Downloads/Nubank_2026-07-08.pdf" /Users/carloshenrique/Documents/PESSOAL/personal-finance/src/lib/pdf/__fixtures__/nubank-sem-senha.pdf
  git status --short src/lib/pdf/__fixtures__
  ```
  Output esperado do `git status`: **vazio** (nada rastreado) — se algo aparecer, o
  `.gitignore` do passo 1.2 não está funcionando; parar e corrigir antes de seguir. Os
  testes que dependem destes 2 arquivos (passo 1.4) usam `describe.skipIf(!hasFixtures)`
  — em qualquer máquina/CI sem os PDFs no disco (o caso normal, já que nunca são
  commitados), esses testes são pulados automaticamente, sem falhar o build.

- [ ] **1.4 — Escrever o teste que falha primeiro.** Criar `src/lib/pdf/extract-text.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { existsSync, readFileSync } from "node:fs";
  import { join } from "node:path";
  import { extractPdfText, PdfPasswordError } from "./extract-text";

  const FIXTURES_DIR = join(__dirname, "__fixtures__");
  const FATURA_PATH = join(FIXTURES_DIR, "fatura-com-senha.pdf");
  const NUBANK_PATH = join(FIXTURES_DIR, "nubank-sem-senha.pdf");
  const hasFixtures = existsSync(FATURA_PATH) && existsSync(NUBANK_PATH);

  describe.skipIf(!hasFixtures)("extractPdfText (fixtures reais)", () => {
    it("extrai texto de um PDF sem senha (Nubank)", async () => {
      const bytes = readFileSync(NUBANK_PATH);
      const result = await extractPdfText(bytes);
      expect(result.hasTextLayer).toBe(true);
      expect(result.text.length).toBeGreaterThan(20);
    });

    it("extrai texto de um PDF com a senha correta", async () => {
      const bytes = readFileSync(FATURA_PATH);
      const result = await extractPdfText(bytes, "028574373");
      expect(result.hasTextLayer).toBe(true);
      expect(result.text.length).toBeGreaterThan(20);
    });

    it("lança PdfPasswordError com senha errada", async () => {
      const bytes = readFileSync(FATURA_PATH);
      await expect(extractPdfText(bytes, "senha-errada-000")).rejects.toBeInstanceOf(PdfPasswordError);
    });

    it("lança PdfPasswordError quando o PDF exige senha e nenhuma foi informada", async () => {
      const bytes = readFileSync(FATURA_PATH);
      await expect(extractPdfText(bytes)).rejects.toBeInstanceOf(PdfPasswordError);
    });
  });

  describe("extractPdfText (sem fixture)", () => {
    it("propaga erro não-relacionado-a-senha (PDF corrompido) em vez de mascarar como PdfPasswordError", async () => {
      const garbage = Buffer.from("isto não é um PDF válido");
      await expect(extractPdfText(garbage)).rejects.not.toBeInstanceOf(PdfPasswordError);
    });
  });
  ```
  Rodar e ver falhar (módulo `./extract-text` ainda não existe):
  ```bash
  npx vitest run src/lib/pdf/extract-text.test.ts
  ```
  Output esperado: erro de resolução de módulo (`Cannot find module './extract-text'` ou
  equivalente do Vite/Rollup).

- [ ] **1.5 — Implementação mínima.** Criar `src/lib/pdf/extract-text.ts`:
  ```ts
  import { getDocumentProxy, extractText as unpdfExtractText } from "unpdf";

  /**
   * Extração de texto de PDF (`unpdf`, build serverless de PDF.js — sem canvas/DOM,
   * sem binário nativo, roda em runtime Node serverless da Vercel; ver decisão de lib
   * no topo deste comentário no plano de origem,
   * docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T1).
   *
   * NUNCA loga bytes do PDF nem a senha (mesmo racional de `lib/ai/gemini.ts`,
   * docs/30-TELEGRAM.md "Segurança").
   */

  /** PDF cifrado sem senha informada OU com senha incorreta — pdf.js lança
   * `PasswordException` nos dois casos (código `NEED_PASSWORD`/`INCORRECT_PASSWORD`);
   * o chamador (`card-invoice-parser.ts`, `financing-parser.ts`) decide o fallback
   * (pedir senha de novo pro usuário), nunca deixa a exception genérica vazar. */
  export class PdfPasswordError extends Error {
    constructor(
      message: string,
      public readonly cause?: unknown,
    ) {
      super(message);
      this.name = "PdfPasswordError";
    }
  }

  export type PdfExtraction = { text: string; hasTextLayer: boolean };

  /** Texto extraído abaixo deste tamanho é considerado "vazio/lixo" — sinal de PDF
   * ESCANEADO (foto virou PDF sem camada de texto real). Threshold pequeno de
   * propósito: qualquer fatura/extrato real produz muito mais que isso. */
  const MIN_MEANINGFUL_TEXT_LENGTH = 20;

  function isPasswordError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.name === "PasswordException" || /password/i.test(error.message);
  }

  export async function extractPdfText(bytes: Buffer, password?: string): Promise<PdfExtraction> {
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes), password ? { password } : undefined);
    } catch (error) {
      if (isPasswordError(error)) {
        throw new PdfPasswordError("PDF protegido por senha — senha incorreta ou não informada.", error);
      }
      throw error;
    }

    const { text } = await unpdfExtractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    return { text: trimmed, hasTextLayer: trimmed.length >= MIN_MEANINGFUL_TEXT_LENGTH };
  }
  ```

- [ ] **1.6 — Rodar e ver passar.**
  ```bash
  npx vitest run src/lib/pdf/extract-text.test.ts
  ```
  Output esperado (fixtures presentes no disco local, passo 1.3): `4 passed`. Sem as
  fixtures (caso normal em qualquer clone novo/CI, já que nunca são commitadas — passo
  1.2): `1 passed` + `3 skipped`. Se `hasTextLayer` vier `false` pro PDF do Nubank (que
  TEM texto), inspecionar manualmente com um script solto (`node --env-file=.env -e "..."`)
  antes de seguir — não force o teste a passar mudando o threshold sem entender a causa.

- [ ] **1.7 — `tsc` limpo.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Sem erros novos relacionados a `src/lib/pdf/`.

- [ ] **1.8 — Commit — SÓ código, NUNCA os PDFs.**
  ```bash
  git status --short src/lib/pdf/
  ```
  Conferir que `src/lib/pdf/__fixtures__/*.pdf` NÃO aparece na saída (já coberto pelo
  `.gitignore` do passo 1.2) antes de rodar `git add`.
  ```bash
  git add src/lib/pdf/extract-text.ts src/lib/pdf/extract-text.test.ts package.json package-lock.json
  git commit -m "feat(pdf): extração de texto com suporte a senha (unpdf)"
  ```

---

### T2 — Spike `NvidiaNimExtractor` (de-risco, sem código de produção ainda)

Objetivo: confirmar contra a API real do NIM (1) se `deepseek-ai/deepseek-v4-pro` e
`qwen/qwen3.5-397b-a17b` aceitam `response_format` estruturado (json_schema/guided) ou
se é preciso prompt-constrained + zod; (2) latência real de uma fatura inteira; (3) se
`extra_body.chat_template_kwargs.thinking` é reconhecido pelo deepseek na NIM. Resultado
deste spike **não vira teste automatizado** (chamada de rede real, não determinística) —
vira uma decisão documentada que guia T5.

**Files:**
- Create (temporário, fora de `src/`, não commitado): script de verificação manual em
  `/private/tmp/claude-501/.../scratchpad/spike-nvidia.ts` (usar o scratchpad da sessão,
  NUNCA `src/`)
- Create: `src/lib/ai/nvidia.ts` (stub mínimo — finalizado em T5, este passo só valida a
  forma da request contra a API real)

**Interfaces:**
- Consumes: `process.env.NVIDIA_API_KEY`
- Produces: nenhuma API pública ainda — puramente exploratório

Passos:

- [ ] **2.1 — Adicionar `NVIDIA_API_KEY` ao `.env` LOCAL** (arquivo já ignorado pelo git
  — nunca commitado; o dono vai usar uma key de teste aqui e rotacionar depois, ver
  Global Constraints). Este plano NUNCA escreve o valor literal da chave em nenhum
  arquivo/commit/log — só o NOME da env var. Se `.env` ainda não tiver a linha, adicionar:
  ```
  NVIDIA_API_KEY="<a key de teste do dono, colada só localmente>"
  ```
  Confirmar que existe (sem imprimir o valor):
  ```bash
  grep -q NVIDIA_API_KEY /Users/carloshenrique/Documents/PESSOAL/personal-finance/.env && echo "ok" || echo "FALTA NVIDIA_API_KEY no .env"
  ```

- [ ] **2.2 — Script de verificação: texto (deepseek) com JSON guiado.** Criar
  `/private/tmp/.../scratchpad/spike-nvidia.ts`:
  ```ts
  import { readFileSync } from "node:fs";

  const bytes = readFileSync("/Users/carloshenrique/Documents/PESSOAL/personal-finance/src/lib/pdf/__fixtures__/nubank-sem-senha.pdf");
  // Cole aqui o texto já extraído por `extractPdfText` (rode T1 antes e copie o `.text`
  // pra uma const, ou importe `extractPdfText` direto se rodar via tsx no repo).

  const PROMPT = "Extraia todos os lançamentos deste extrato bancário em JSON: { transactions: [{date, amount, type, description}] }. Responda SOMENTE com o JSON.";

  async function main() {
    const started = Date.now();
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NVIDIA_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-ai/deepseek-v4-pro",
        messages: [{ role: "user", content: `${PROMPT}\n\n<COLE O TEXTO EXTRAÍDO AQUI>` }],
        max_tokens: 16384,
        extra_body: { chat_template_kwargs: { thinking: false } },
        stream: false,
      }),
    });
    console.log("status", response.status, "latência ms", Date.now() - started);
    console.log(JSON.stringify(await response.json(), null, 2));
  }

  main();
  ```
  Rodar:
  ```bash
  cd /Users/carloshenrique/Documents/PESSOAL/personal-finance && node --env-file=.env --experimental-strip-types /private/tmp/claude-501/*/scratchpad/spike-nvidia.ts
  ```
  Anotar no scratchpad (não no repo): status HTTP, latência, se o JSON de resposta veio
  bem-formado direto no `choices[0].message.content`, se `extra_body.chat_template_kwargs.thinking`
  foi aceito sem erro 400.

- [ ] **2.3 — Repetir pra visão (qwen) com uma imagem qualquer de teste** (foto de
  celular de um recibo, ou renderizar a 1ª página do PDF escaneado se houver um à mão) —
  mesma forma de request do spec (`content: [{type:text}, {type:image_url}]`). Anotar se
  aceita `image_url.url` como `data:` URL base64 direto (sem upload prévio).

- [ ] **2.4 — Decisão documentada.** No topo de `src/lib/ai/nvidia.ts` (stub criado
  agora, finalizado em T5), escrever um comentário com a decisão real observada:
  ```ts
  /**
   * Decisão do spike (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T2):
   * - `response_format` json_schema: <PREENCHER: aceito / não aceito / não testado>.
   * - Fallback adotado: prompt-constrained (schema embutido no prompt) + validação zod
   *   + 1 retry (`extract.ts`) — funciona independente do resultado acima.
   * - `extra_body.chat_template_kwargs.thinking:false`: <PREENCHER: aceito sem erro 400 / rejeitado>.
   * - Latência observada numa fatura real (~15-20 lançamentos): <PREENCHER> ms.
   */
  export {};
  ```
  Se o subagente confirmar que `response_format: { type: "json_schema", json_schema: {...} }`
  FUNCIONA no deepseek/qwen da NIM, adicionar isso como otimização em T5 (envio de
  `response_format` além do prompt-constrained) — mas o prompt-constrained + zod +
  retry é o baseline funcional independentemente do resultado, e é o que este plano
  implementa em T5/T7 sem bloquear em achar a resposta certa aqui.

- [ ] **2.5 — Apagar o script do scratchpad** (é exploratório, não fica no repo):
  ```bash
  rm /private/tmp/claude-501/*/scratchpad/spike-nvidia.ts
  ```
  Nada para commitar neste passo além do comentário de decisão em `nvidia.ts` (que já
  entra no commit de T5).

---

## Fase 1 — Camada de IA reutilizável (SOLID)

### T3 — `src/lib/ai/types.ts`

**Files:**
- Create: `src/lib/ai/types.ts`

**Interfaces:**
- Produces: `AiProvider`, `AiRole`, `AiModelParams`, `AiModelConfig` (com `fallback?: AiProvider`), `ExtractionInput`,
  `JsonSchema`, `ExtractOpts`, `StructuredExtractor`

Decisão de design (resolve uma ambiguidade do spec — documentar aqui pra T5/T6/T7 não
divergirem): o spec descreve a porta como `extract(input, schema, parse, opts)`, mas o
texto também diz "parsers só chamam isto com **role + prompt** + schema + parse" — ou
seja, o prompt é um argumento PRÓPRIO, não embutido em `ExtractionInput.text` (que carrega
só o TEXTO DO DOCUMENTO, nunca o prompt). Isso separa limpo "o que o parser quer perguntar"
(`prompt`) de "o que foi extraído do documento" (`input`), e resolve o caso de `vision`
(que no spec não tem campo de texto — o prompt tem que vir por fora mesmo). `model:
AiModelConfig` é passado pelo FACADE (`extract.ts`) pro adapter já resolvido — os parsers
NUNCA veem `AiModelConfig`, só `role` (mantém DIP: parser depende da porta, não do
provider/modelo).

Correção do coordenador (instrução do dono: "não desabilite o Gemini, deixe como
fallback"): `AiModelConfig` ganha `fallback?: AiProvider` — o registry (`models.ts`, T4)
decide, por `role`, se existe um provider de fallback e qual é; o facade (`extract.ts`,
T7) é quem de fato tenta o fallback quando o primário esgota. `types.ts` só carrega o
campo, sem lógica.

Passos:

- [ ] **3.1 — Escrever o arquivo direto (tipos puros, sem lógica pra testar).**
  ```ts
  // src/lib/ai/types.ts

  /**
   * Camada de IA provider-agnóstica (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Arquitetura da camada de IA") — porta (DIP, ~/.claude/rules/01-solid.md): parsers de
   * documento (`modules/imports/parsers/card-invoice-parser.ts`,
   * `modules/telegram/financing-parser.ts`) dependem só de `extractStructured` (`extract.ts`),
   * nunca de um provider concreto (`nvidia.ts`/`gemini.ts`) nem do registry (`models.ts`).
   */

  export type AiProvider = "nvidia" | "gemini";

  /** Papel semântico da extração — resolve pra um provider+modelo real via `models.ts` (fonte
   * única, "Trocar de modelo/provider = editar o registry, sem tocar em parser"). */
  export type AiRole = "document-text" | "document-text-reasoning" | "document-vision";

  /** Quirks por modelo repassados como `extra_body`/campos top-level na chamada NVIDIA (ver
   * `nvidia.ts`, `buildExtraBody`) — cada adapter usa só os campos que seu provider entende
   * (Gemini ignora todos, usa seu próprio `thinkingBudget` fixo em `callGemini`). */
  export type AiModelParams = {
    /** deepseek: liga/desliga "thinking" (`extra_body.chat_template_kwargs.thinking`). */
    thinking?: boolean;
    /** nemotron: orçamento de raciocínio (`extra_body.reasoning_budget`). */
    reasoningBudget?: number;
    /** qwen (visão): amostragem — valores do spec (0.6/0.95). */
    temperature?: number;
    topP?: number;
  };

  export type AiModelConfig = {
    provider: AiProvider;
    model: string;
    modality: "text" | "vision";
    params?: AiModelParams;
    /** Provider de fallback pra esta `role` (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md,
     * correção "Gemini como FALLBACK de provider") — o facade (`extract.ts`) tenta este
     * provider só depois do primário (`provider` acima) esgotar retries e continuar `null`.
     * `undefined` = sem fallback pra esta role (ex.: `document-text-reasoning`, hoje). */
    fallback?: AiProvider;
  };

  /** `text`: texto já extraído do documento (ex.: `extractPdfText(...).text`) — NUNCA o
   * prompt (esse vai à parte, ver `StructuredExtractor.extract`). `vision`: bytes crus
   * (imagem OU PDF, ver limitação documentada em `card-invoice-parser.ts`) + mimeType. */
  export type ExtractionInput =
    | { kind: "text"; text: string }
    | { kind: "vision"; bytes: Buffer; mimeType: string };

  /** JSON Schema padrão (draft-like, `type` em lowercase — `"object"`/`"string"`/...) — cada
   * parser define o seu (ver `card-invoice-parser.ts` `INVOICE_RESPONSE_SCHEMA`,
   * `financing-parser.ts` `FINANCING_RESPONSE_SCHEMA`). Adapters convertem pro formato do
   * próprio provider quando precisam (ver `gemini.ts`, `toGeminiSchema`) — NENHUM parser
   * conhece o formato específico de um provider. */
  export type JsonSchema = Record<string, unknown>;

  export type ExtractOpts = {
    /** Timeout da chamada em ms — default por adapter (documento de fatura/contrato é mais
     * lento que texto curto, ver `nvidia.ts` `DEFAULT_TIMEOUT_MS`). */
    timeoutMs?: number;
  };

  /**
   * Porta (DIP) — todo adapter de provider implementa isto. NUNCA lança: falha de
   * rede/timeout/parse vira `null`, sempre (erro-como-dado,
   * ~/.claude/rules/06-composition-errors.md; todo adapter honra o mesmo contrato — LSP).
   * `model` é resolvido pelo FACADE (`extract.ts`) a partir da `role` — o adapter só executa
   * a chamada com o modelo/params já decididos, nunca decide ele mesmo qual modelo usar.
   */
  export interface StructuredExtractor {
    extract<T>(
      input: ExtractionInput,
      prompt: string,
      schema: JsonSchema,
      parse: (raw: unknown) => T | null,
      model: AiModelConfig,
      opts?: ExtractOpts,
    ): Promise<T | null>;
  }
  ```

- [ ] **3.2 — `tsc` limpo (só compila, sem consumidor ainda).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Sem erros.

- [ ] **3.3 — Commit.**
  ```bash
  git add src/lib/ai/types.ts
  git commit -m "feat(ai): porta StructuredExtractor + tipos da camada de IA"
  ```

---

### T4 — `src/lib/ai/models.ts` (registry)

**Files:**
- Create: `src/lib/ai/models.ts`
- Create: `src/lib/ai/models.test.ts`

**Interfaces:**
- Consumes: `AiRole`, `AiModelConfig`, `AiProvider` (de `./types`)
- Produces: `resolveAiModel(role: AiRole): AiModelConfig`

Correção do coordenador — Gemini como FALLBACK de provider (nunca desabilitado): `document-text`
e `document-vision` ganham `fallback: "gemini"` no registry — são os 2 roles que
`card-invoice-parser.ts` (T10) realmente usa por padrão, então são os que mais se
beneficiam de não cair sem alternativa num rate-limit do free tier da NIM.
`document-text-reasoning` (nemotron) fica SEM fallback por ora — é um upgrade opt-in
raramente acionado (ver T13), não vale a complexidade extra ainda (YAGNI,
~/.claude/rules/02-dry-kiss-yagni.md); adicionar depois é só uma linha aqui se precisar.

Passos:

- [ ] **4.1 — Teste que falha primeiro.** Criar `src/lib/ai/models.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { resolveAiModel } from "./models";

  describe("resolveAiModel", () => {
    it("document-text resolve pra nvidia deepseek com thinking desligado + fallback gemini", () => {
      const config = resolveAiModel("document-text");
      expect(config).toEqual({
        provider: "nvidia",
        model: "deepseek-ai/deepseek-v4-pro",
        modality: "text",
        params: { thinking: false },
        fallback: "gemini",
      });
    });

    it("document-vision resolve pra nvidia qwen + fallback gemini", () => {
      const config = resolveAiModel("document-vision");
      expect(config.provider).toBe("nvidia");
      expect(config.model).toBe("qwen/qwen3.5-397b-a17b");
      expect(config.modality).toBe("vision");
      expect(config.fallback).toBe("gemini");
    });

    it("document-text-reasoning resolve pra nemotron com reasoning_budget, SEM fallback", () => {
      const config = resolveAiModel("document-text-reasoning");
      expect(config.model).toBe("nvidia/nemotron-3-nano-30b-a3b");
      expect(config.params?.reasoningBudget).toBeGreaterThan(0);
      expect(config.fallback).toBeUndefined();
    });
  });
  ```
  ```bash
  npx vitest run src/lib/ai/models.test.ts
  ```
  Output esperado: falha de resolução de módulo `./models`.

- [ ] **4.2 — Implementação mínima.** Criar `src/lib/ai/models.ts`:
  ```ts
  import type { AiModelConfig, AiRole } from "./types";

  /**
   * Registry central de modelos (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Registry de modelos") — FONTE ÚNICA de qual provider/modelo (+ fallback) cada `role`
   * usa. Trocar de modelo/fallback é editar esta constante, nunca um parser (OCP,
   * ~/.claude/rules/01-solid.md).
   *
   * `fallback: "gemini"` em `document-text`/`document-vision` — Gemini NUNCA é
   * desabilitado (instrução do dono): se o provider primário (NVIDIA) esgotar (rate
   * limit/timeout/JSON inválido), o facade (`extract.ts`) tenta Gemini antes de devolver
   * `null`. `document-text-reasoning` fica sem fallback por ora (YAGNI — role pouco
   * usado, ver T13).
   *
   * `reasoningBudget` de `document-text-reasoning`: 1024 tokens de raciocínio — valor
   * inicial conservador; role NUNCA é o default de nenhum parser (thinking/reasoning OFF
   * por padrão é invariante global) — só entra em uso manual/opt-in se medição concreta
   * mostrar confusão de campo (ver T13, nota sobre upgrade condicional).
   */
  const REGISTRY: Record<AiRole, AiModelConfig> = {
    "document-text": {
      provider: "nvidia",
      model: "deepseek-ai/deepseek-v4-pro",
      modality: "text",
      params: { thinking: false },
      fallback: "gemini",
    },
    "document-text-reasoning": {
      provider: "nvidia",
      model: "nvidia/nemotron-3-nano-30b-a3b",
      modality: "text",
      params: { reasoningBudget: 1024 },
    },
    "document-vision": {
      provider: "nvidia",
      model: "qwen/qwen3.5-397b-a17b",
      modality: "vision",
      params: { temperature: 0.6, topP: 0.95 },
      fallback: "gemini",
    },
  };

  export function resolveAiModel(role: AiRole): AiModelConfig {
    return REGISTRY[role];
  }
  ```

- [ ] **4.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/lib/ai/models.test.ts
  ```
  Output esperado: `3 passed`.

- [ ] **4.4 — `tsc` limpo + commit.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  git add src/lib/ai/models.ts src/lib/ai/models.test.ts
  git commit -m "feat(ai): registry central de modelos por role"
  ```

---

### T5 — `src/lib/ai/nvidia.ts` (finaliza o spike)

**Files:**
- Modify: `src/lib/ai/nvidia.ts` (stub de T2 → implementação completa)
- Create: `src/lib/ai/nvidia.test.ts`

**Interfaces:**
- Consumes: `ExtractionInput`, `ExtractOpts`, `JsonSchema`, `StructuredExtractor`, `AiModelConfig` (de `./types`)
- Consumes: `process.env.NVIDIA_API_KEY`
- Produces: `class NvidiaNimExtractor implements StructuredExtractor`

Passos:

- [ ] **5.1 — Teste que falha primeiro.** Criar `src/lib/ai/nvidia.test.ts` (mocka
  `fetch` global — mesmo padrão dos testes puros do projeto, sem rede real):
  ```ts
  import { afterEach, describe, expect, it, vi } from "vitest";
  import { NvidiaNimExtractor } from "./nvidia";
  import type { AiModelConfig } from "./types";

  const TEXT_MODEL: AiModelConfig = {
    provider: "nvidia",
    model: "deepseek-ai/deepseek-v4-pro",
    modality: "text",
    params: { thinking: false },
  };

  const VISION_MODEL: AiModelConfig = {
    provider: "nvidia",
    model: "qwen/qwen3.5-397b-a17b",
    modality: "vision",
    params: { temperature: 0.6, topP: 0.95 },
  };

  function jsonResponse(content: string, ok = true, status = 200) {
    return {
      ok,
      status,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
    } as Response;
  }

  describe("NvidiaNimExtractor", () => {
    const extractor = new NvidiaNimExtractor();

    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.NVIDIA_API_KEY;
    });

    it("retorna null sem NVIDIA_API_KEY, sem chamar fetch", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);

      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
        TEXT_MODEL,
      );

      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("monta messages de TEXTO com prompt + schema + texto do documento", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetchSpy);

      const parse = (raw: unknown) => raw as { ok: boolean };
      const result = await extractor.extract(
        { kind: "text", text: "TEXTO DO DOCUMENTO" },
        "PROMPT AQUI",
        { type: "object", properties: { ok: { type: "boolean" } } },
        parse,
        TEXT_MODEL,
      );

      expect(result).toEqual({ ok: true });
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("deepseek-ai/deepseek-v4-pro");
      expect(body.stream).toBe(false);
      expect(body.extra_body).toEqual({ chat_template_kwargs: { thinking: false } });
      expect(body.messages[0].content).toContain("PROMPT AQUI");
      expect(body.messages[0].content).toContain("TEXTO DO DOCUMENTO");
      expect(init.headers.Authorization).toBe("Bearer test-key");
    });

    it("monta messages de VISÃO com content array (text + image_url data URL)", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      const fetchSpy = vi.fn().mockResolvedValue(jsonResponse(JSON.stringify({ ok: true })));
      vi.stubGlobal("fetch", fetchSpy);

      await extractor.extract(
        { kind: "vision", bytes: Buffer.from("fake-bytes"), mimeType: "image/jpeg" },
        "PROMPT VISÃO",
        { type: "object" },
        (raw) => raw,
        VISION_MODEL,
      );

      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(Array.isArray(body.messages[0].content)).toBe(true);
      expect(body.messages[0].content[0]).toEqual({ type: "text", text: expect.stringContaining("PROMPT VISÃO") });
      expect(body.messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
      expect(body.temperature).toBe(0.6);
      expect(body.top_p).toBe(0.95);
    });

    it("retorna null em resposta não-2xx, sem lançar", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "erro interno" } as Response));

      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
        TEXT_MODEL,
      );
      expect(result).toBeNull();
    });

    it("retorna null quando o content não é JSON parseável, sem lançar", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("isto não é json nem tem chaves")));

      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
        TEXT_MODEL,
      );
      expect(result).toBeNull();
    });

    it("extrai JSON envolto em texto/markdown (fallback de regex)", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      const content = 'Aqui está o resultado:\n```json\n{"ok":true}\n```';
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(content)));

      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw as { ok: boolean },
        TEXT_MODEL,
      );
      expect(result).toEqual({ ok: true });
    });

    it("retorna null quando fetch lança (rede/timeout), sem propagar a exception", async () => {
      process.env.NVIDIA_API_KEY = "test-key";
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
        TEXT_MODEL,
      );
      expect(result).toBeNull();
    });
  });
  ```
  ```bash
  npx vitest run src/lib/ai/nvidia.test.ts
  ```
  Output esperado: falha (o stub de T2 só tem `export {}`, `NvidiaNimExtractor` não existe).

- [ ] **5.2 — Implementação completa.** Substituir `src/lib/ai/nvidia.ts` (mantém o
  comentário de decisão do spike de T2 no topo):
  ```ts
  import type { AiModelConfig, ExtractionInput, ExtractOpts, JsonSchema, StructuredExtractor } from "./types";

  /**
   * Decisão do spike (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T2):
   * ver comentário preenchido pelo subagente que rodou T2 — <PREENCHER com o resultado real>.
   * Baseline implementado aqui independe do resultado: prompt-constrained (schema embutido
   * no prompt) + validação zod (`extract.ts`) + 1 retry — funciona mesmo se
   * `response_format` estruturado não for suportado pelo modelo.
   *
   * `NvidiaNimExtractor` — adapter OpenAI-compatible pro NVIDIA NIM
   * (`https://integrate.api.nvidia.com/v1/chat/completions`). Isola os quirks por
   * modalidade (SRP, ~/.claude/rules/01-solid.md): texto → `messages[0].content` string;
   * visão → `content` array (`text` + `image_url` data URL base64). `extra_body` varia por
   * modelo (`thinking` pro deepseek, `reasoning_budget` pro nemotron) — decidido só a
   * partir de `model.params` (nunca hardcoded aqui, o registry é a fonte única).
   *
   * NUNCA lança (erro-como-dado): sem `NVIDIA_API_KEY`, timeout, resposta não-2xx, JSON
   * fora do shape esperado → `null`. NUNCA loga bytes do documento nem a API key.
   */

  const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
  const DEFAULT_TIMEOUT_MS = 60_000;
  const MAX_TOKENS = 16_384;

  type NvidiaContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  type NvidiaMessage = { role: "user"; content: string | NvidiaContentPart[] };

  /** Prompt + schema (embutido como texto — ver decisão de spike acima) sempre juntos; o
   * texto do DOCUMENTO só entra pro caso `text` (visão manda os bytes como imagem à parte). */
  function buildInstruction(prompt: string, schema: JsonSchema): string {
    return [
      prompt,
      "",
      "Responda SOMENTE com um JSON válido (sem markdown, sem texto antes/depois) seguindo este schema:",
      JSON.stringify(schema),
    ].join("\n");
  }

  function buildMessages(input: ExtractionInput, prompt: string, schema: JsonSchema): NvidiaMessage[] {
    const instruction = buildInstruction(prompt, schema);

    if (input.kind === "text") {
      return [{ role: "user", content: `${instruction}\n\nDocumento:\n${input.text}` }];
    }

    return [
      {
        role: "user",
        content: [
          { type: "text", text: instruction },
          { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}` } },
        ],
      },
    ];
  }

  function buildExtraBody(config: AiModelConfig): Record<string, unknown> | undefined {
    if (config.params?.thinking !== undefined) {
      return { chat_template_kwargs: { thinking: config.params.thinking } };
    }
    if (config.params?.reasoningBudget !== undefined) {
      return { reasoning_budget: config.params.reasoningBudget };
    }
    return undefined;
  }

  /** `choices[0].message.content` às vezes vem cru (JSON puro) ou envolto em texto/markdown
   * (` ```json ... ``` `) mesmo com instrução explícita — tenta direto, cai pro 1º bloco
   * `{...}` encontrado via regex antes de desistir. */
  function extractJsonFromContent(content: string): unknown | null {
    try {
      return JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
  }

  export class NvidiaNimExtractor implements StructuredExtractor {
    async extract<T>(
      input: ExtractionInput,
      prompt: string,
      schema: JsonSchema,
      parse: (raw: unknown) => T | null,
      model: AiModelConfig,
      opts?: ExtractOpts,
    ): Promise<T | null> {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      try {
        const body: Record<string, unknown> = {
          model: model.model,
          messages: buildMessages(input, prompt, schema),
          max_tokens: MAX_TOKENS,
          stream: false,
        };
        const extraBody = buildExtraBody(model);
        if (extraBody) body.extra_body = extraBody;
        if (model.params?.temperature !== undefined) body.temperature = model.params.temperature;
        if (model.params?.topP !== undefined) body.top_p = model.params.topP;

        const response = await fetch(NVIDIA_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          signal: controller.signal,
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          console.error("[lib/ai/nvidia] request failed", { status: response.status, detail: detail.slice(0, 300) });
          return null;
        }

        const json = (await response.json().catch(() => null)) as
          | { choices?: Array<{ message?: { content?: string } }> }
          | null;
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content !== "string") return null;

        const rawJson = extractJsonFromContent(content);
        if (rawJson === null) return null;

        return parse(rawJson);
      } catch (error) {
        console.error("[lib/ai/nvidia] extract failed", { reason: error instanceof Error ? error.name : "unknown" });
        return null;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  ```

- [ ] **5.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/lib/ai/nvidia.test.ts
  ```
  Output esperado: `8 passed`.

- [ ] **5.4 — `tsc` limpo + commit.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  git add src/lib/ai/nvidia.ts src/lib/ai/nvidia.test.ts
  git commit -m "feat(ai): NvidiaNimExtractor (texto+visão, erro-como-dado)"
  ```

---

### T6 — `src/lib/ai/gemini.ts` (adiciona `GeminiExtractor`)

**Files:**
- Modify: `src/lib/ai/gemini.ts` (adiciona `GeminiExtractor` — `callGemini` intocado)
- Create: `src/lib/ai/gemini.test.ts`

**Interfaces:**
- Consumes: `callGemini`, `GeminiContentPart` (já existentes no mesmo arquivo)
- Consumes: `ExtractionInput`, `ExtractOpts`, `JsonSchema`, `StructuredExtractor`, `AiModelConfig` (de `./types`)
- Produces: `class GeminiExtractor implements StructuredExtractor`, `toGeminiSchema(schema: JsonSchema): object` (exportado só pra teste direto)

Correção do coordenador — Gemini é FALLBACK ativo, não um caminho morto: desde T4, os
roles `document-text`/`document-vision` já têm `fallback: "gemini"` no registry —
`GeminiExtractor` (esta tarefa) é o que o facade (`extract.ts`, T7) de fato instancia e
chama quando o provider primário (NVIDIA) esgota retry. Não é um adapter "pronto mas sem
uso": é exercitado toda vez que a NVIDIA falhar/rate-limitar em produção. `toGeminiSchema`
cobre o subset de JSON Schema usado pelos parsers deste projeto (`object`/`array`/`string`/
`number`/`integer`/`boolean` + `properties`/`items`/`enum`/`required`/`nullable`).

Passos:

- [ ] **6.1 — Teste que falha primeiro.** Criar `src/lib/ai/gemini.test.ts`:
  ```ts
  import { afterEach, describe, expect, it, vi } from "vitest";
  import { GeminiExtractor, toGeminiSchema } from "./gemini";
  import type { AiModelConfig } from "./types";

  const MODEL: AiModelConfig = { provider: "gemini", model: "n/a", modality: "text" };

  describe("toGeminiSchema", () => {
    it("converte type pra UPPERCASE recursivamente", () => {
      expect(
        toGeminiSchema({
          type: "object",
          properties: {
            items: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } },
          },
        }),
      ).toEqual({
        type: "OBJECT",
        properties: {
          items: { type: "ARRAY", items: { type: "OBJECT", properties: { name: { type: "STRING" } } } },
        },
      });
    });

    it("preserva enum/required/nullable", () => {
      expect(toGeminiSchema({ type: "string", enum: ["A", "B"], nullable: true })).toEqual({
        type: "STRING",
        enum: ["A", "B"],
        nullable: true,
      });
    });
  });

  describe("GeminiExtractor", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      delete process.env.GEMINI_API_KEY;
    });

    it("retorna null sem GEMINI_API_KEY (delega pro callGemini existente)", async () => {
      const extractor = new GeminiExtractor();
      const result = await extractor.extract(
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
        MODEL,
      );
      expect(result).toBeNull();
    });

    it("monta parts de VISÃO com inlineData + text (mesmo shape de financing-parser.ts)", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ok: true }) }] } }] }),
      } as Response);
      vi.stubGlobal("fetch", fetchSpy);

      const extractor = new GeminiExtractor();
      const result = await extractor.extract(
        { kind: "vision", bytes: Buffer.from("bytes"), mimeType: "image/jpeg" },
        "prompt visão",
        { type: "object" },
        (raw) => raw as { ok: boolean },
        MODEL,
      );

      expect(result).toEqual({ ok: true });
      const [, init] = fetchSpy.mock.calls[0];
      const body = JSON.parse(init.body as string);
      expect(body.contents[0].parts[0].inlineData.mimeType).toBe("image/jpeg");
      expect(body.contents[0].parts[1].text).toBe("prompt visão");
    });
  });
  ```
  ```bash
  npx vitest run src/lib/ai/gemini.test.ts
  ```
  Output esperado: falha (`GeminiExtractor`/`toGeminiSchema` não existem ainda).

- [ ] **6.2 — Implementação.** Adicionar ao FINAL de `src/lib/ai/gemini.ts` (sem tocar em
  `callGemini`/`GeminiContentPart` existentes):
  ```ts
  import type { AiModelConfig, ExtractionInput, ExtractOpts, JsonSchema, StructuredExtractor } from "./types";

  /**
   * `GeminiExtractor` — adapter de FALLBACK (instrução do dono: "não desabilite o Gemini,
   * deixe como fallback") embrulhando o `callGemini` acima. `document-text`/`document-vision`
   * já apontam `fallback: "gemini"` no registry (`models.ts`, T4) — o facade (`extract.ts`,
   * T7) instancia e chama isto de verdade quando o provider primário (NVIDIA) esgota
   * retry, não é um caminho morto. `_model` não é usado: `callGemini` já fixa
   * `GEMINI_MODEL`/`thinkingBudget=0` internamente (mesma decisão de todos os callers atuais
   * do Telegram/import de extrato) — trocar de modelo Gemini continua sendo só editar a
   * constante `GEMINI_MODEL` no topo deste arquivo (OCP), nunca um parser.
   */

  type JsonSchemaNode = {
    type?: string;
    properties?: Record<string, JsonSchemaNode>;
    items?: JsonSchemaNode;
    required?: string[];
    enum?: string[];
    nullable?: boolean;
  };

  /** Converte um JSON Schema padrão (`type` lowercase) pro formato OpenAPI do Gemini (`type`
   * UPPERCASE) — só o subset usado pelos parsers deste projeto. */
  export function toGeminiSchema(schema: JsonSchema): object {
    return convertSchemaNode(schema as JsonSchemaNode);
  }

  function convertSchemaNode(node: JsonSchemaNode): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (node.type) result.type = node.type.toUpperCase();
    if (node.enum) result.enum = node.enum;
    if (node.nullable) result.nullable = true;
    if (node.required) result.required = node.required;
    if (node.properties) {
      result.properties = Object.fromEntries(
        Object.entries(node.properties).map(([key, value]) => [key, convertSchemaNode(value)]),
      );
    }
    if (node.items) result.items = convertSchemaNode(node.items);
    return result;
  }

  export class GeminiExtractor implements StructuredExtractor {
    async extract<T>(
      input: ExtractionInput,
      prompt: string,
      schema: JsonSchema,
      parse: (raw: unknown) => T | null,
      _model: AiModelConfig,
      opts?: ExtractOpts,
    ): Promise<T | null> {
      const parts: GeminiContentPart[] =
        input.kind === "text"
          ? [{ text: `${prompt}\n\n${input.text}` }]
          : [{ inlineData: { mimeType: input.mimeType, data: input.bytes.toString("base64") } }, { text: prompt }];

      return callGemini([{ parts }], "lib-ai-extract", toGeminiSchema(schema), parse, opts?.timeoutMs);
    }
  }
  ```

- [ ] **6.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/lib/ai/gemini.test.ts
  ```
  Output esperado: `4 passed`.

- [ ] **6.4 — Regressão: `callGemini` intocado.** Confirmar que os callers existentes
  ainda passam (Telegram + pdf-parser de extrato — não deveriam ter mudado nada, mas
  rodar a suíte inteira pra garantir que o import novo em `gemini.ts` não quebrou nada):
  ```bash
  npx vitest run
  ```
  Output esperado: todos os testes já existentes continuam passando (nenhuma regressão).

- [ ] **6.5 — `tsc` limpo + commit.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  git add src/lib/ai/gemini.ts src/lib/ai/gemini.test.ts
  git commit -m "feat(ai): GeminiExtractor (adapter opcional, callGemini intocado)"
  ```

---

### T7 — `src/lib/ai/extract.ts` (facade — roteamento + retry + FALLBACK de provider)

**Files:**
- Create: `src/lib/ai/extract.ts`
- Create: `src/lib/ai/extract.test.ts`

**Interfaces:**
- Consumes: `resolveAiModel` (de `./models`), `NvidiaNimExtractor` (de `./nvidia`), `GeminiExtractor` (de `./gemini`)
- Produces: `extractStructured<T>(role: AiRole, input: ExtractionInput, prompt: string, schema: JsonSchema, parse: (raw: unknown) => T | null, opts?: ExtractOpts): Promise<T | null>`

Cadeia de tentativas (correção do coordenador — "não desabilite o Gemini, deixe como
fallback"): **primário → retry do primário → fallback de provider (se configurado no
registry) → `null`**. O retry-do-primário (mesmo provider, 2ª chamada) cobre hiccup
transitório de rede; o fallback de PROVIDER (Gemini) cobre o primário estar
genuinamente fora do ar/rate-limitado — os dois são independentes e cumulativos, nenhum
substitui o outro. `role`s sem `fallback` no registry (`document-text-reasoning`, hoje)
simplesmente pulam a 3ª etapa.

Passos:

- [ ] **7.1 — Teste que falha primeiro.** Criar `src/lib/ai/extract.test.ts` (mocka os
  adapters via `vi.mock`, testa ROTEAMENTO + retry + fallback do facade — usa o registry
  REAL de `./models`, não mockado, pra exercitar o `fallback: "gemini"` de
  `document-text`/`document-vision` e a ausência dele em `document-text-reasoning`):
  ```ts
  import { describe, expect, it, vi } from "vitest";

  const nvidiaExtractMock = vi.fn();
  const geminiExtractMock = vi.fn();

  vi.mock("./nvidia", () => ({
    NvidiaNimExtractor: vi.fn().mockImplementation(() => ({ extract: nvidiaExtractMock })),
  }));
  vi.mock("./gemini", () => ({
    GeminiExtractor: vi.fn().mockImplementation(() => ({ extract: geminiExtractMock })),
  }));

  const { extractStructured } = await import("./extract");

  describe("extractStructured", () => {
    it("1ª tentativa do primário (nvidia) sucede — Gemini nunca é chamado", async () => {
      nvidiaExtractMock.mockResolvedValueOnce({ ok: true });

      const result = await extractStructured(
        "document-text",
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
      );

      expect(result).toEqual({ ok: true });
      expect(nvidiaExtractMock).toHaveBeenCalledTimes(1);
      const [, , , , model] = nvidiaExtractMock.mock.calls[0];
      expect(model.model).toBe("deepseek-ai/deepseek-v4-pro");
      expect(geminiExtractMock).not.toHaveBeenCalled();
    });

    it("retry do MESMO provider: 1ª tentativa null, 2ª sucede — Gemini nunca é chamado", async () => {
      nvidiaExtractMock.mockResolvedValueOnce(null).mockResolvedValueOnce({ ok: true });

      const result = await extractStructured(
        "document-text",
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
      );

      expect(result).toEqual({ ok: true });
      expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
      expect(geminiExtractMock).not.toHaveBeenCalled();
    });

    it("FALLBACK: primário (nvidia) esgota 1ª+retry com null → Gemini é chamado → retorna válido", async () => {
      nvidiaExtractMock.mockResolvedValue(null);
      geminiExtractMock.mockResolvedValueOnce({ ok: true, source: "gemini" });

      const result = await extractStructured(
        "document-vision",
        { kind: "vision", bytes: Buffer.from("x"), mimeType: "image/png" },
        "prompt",
        { type: "object" },
        (raw) => raw,
      );

      expect(result).toEqual({ ok: true, source: "gemini" });
      expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
      expect(geminiExtractMock).toHaveBeenCalledTimes(1);
      const [, , , , fallbackModel] = geminiExtractMock.mock.calls[0];
      expect(fallbackModel.provider).toBe("gemini");
    });

    it("primário E fallback esgotam → null, sem lançar", async () => {
      nvidiaExtractMock.mockResolvedValue(null);
      geminiExtractMock.mockResolvedValue(null);

      const result = await extractStructured(
        "document-vision",
        { kind: "vision", bytes: Buffer.from("x"), mimeType: "image/png" },
        "prompt",
        { type: "object" },
        (raw) => raw,
      );

      expect(result).toBeNull();
      expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
      expect(geminiExtractMock).toHaveBeenCalledTimes(1);
    });

    it("role SEM fallback configurado (document-text-reasoning) nunca chama Gemini, mesmo esgotando retry", async () => {
      nvidiaExtractMock.mockResolvedValue(null);

      const result = await extractStructured(
        "document-text-reasoning",
        { kind: "text", text: "doc" },
        "prompt",
        { type: "object" },
        (raw) => raw,
      );

      expect(result).toBeNull();
      expect(nvidiaExtractMock).toHaveBeenCalledTimes(2);
      expect(geminiExtractMock).not.toHaveBeenCalled();
    });
  });
  ```
  ```bash
  npx vitest run src/lib/ai/extract.test.ts
  ```
  Output esperado: falha de resolução de módulo `./extract`.

- [ ] **7.2 — Implementação.** Criar `src/lib/ai/extract.ts`:
  ```ts
  import { resolveAiModel } from "./models";
  import { NvidiaNimExtractor } from "./nvidia";
  import { GeminiExtractor } from "./gemini";
  import type { AiModelConfig, AiProvider, AiRole, ExtractionInput, ExtractOpts, JsonSchema, StructuredExtractor } from "./types";

  /**
   * Facade central da camada de IA (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Facade (extractStructured)") — ÚNICO ponto que parsers de documento chamam. Resolve
   * `role` → `{provider, model, params, fallback}` no registry (`models.ts`), delega pro
   * adapter certo (SRP/DIP: parser não conhece provider/modelo/quirk de request).
   *
   * Cadeia de tentativas (nunca lança — erro-como-dado, mesmo contrato de
   * `StructuredExtractor`): 1) provider PRIMÁRIO; 2) RETRY do mesmo provider (hiccup
   * transitório); 3) provider de FALLBACK do registry, se `model.fallback` existir —
   * Gemini nunca é desabilitado, é a rede de segurança quando o primário (NVIDIA) esgota
   * (rate limit/timeout/JSON fora do shape); 4) `null`.
   */

  const nvidiaExtractor = new NvidiaNimExtractor();
  const geminiExtractor = new GeminiExtractor();

  function extractorFor(provider: AiProvider): StructuredExtractor {
    return provider === "nvidia" ? nvidiaExtractor : geminiExtractor;
  }

  /** `GeminiExtractor.extract` ignora o campo `model` (usa o modelo fixo `GEMINI_MODEL`
   * interno, ver `gemini.ts`) — este rótulo só existe pra logging/depuração, nunca é
   * enviado numa request real. */
  const FALLBACK_MODEL_LABEL = "gemini (fallback)";

  function buildFallbackModel(provider: AiProvider, modality: AiModelConfig["modality"]): AiModelConfig {
    return { provider, model: FALLBACK_MODEL_LABEL, modality };
  }

  export async function extractStructured<T>(
    role: AiRole,
    input: ExtractionInput,
    prompt: string,
    schema: JsonSchema,
    parse: (raw: unknown) => T | null,
    opts?: ExtractOpts,
  ): Promise<T | null> {
    const model = resolveAiModel(role);
    const primary = extractorFor(model.provider);

    const firstAttempt = await primary.extract(input, prompt, schema, parse, model, opts);
    if (firstAttempt !== null) return firstAttempt;

    const retryAttempt = await primary.extract(input, prompt, schema, parse, model, opts);
    if (retryAttempt !== null) return retryAttempt;

    if (!model.fallback) return null;

    const fallbackExtractor = extractorFor(model.fallback);
    return fallbackExtractor.extract(input, prompt, schema, parse, buildFallbackModel(model.fallback, model.modality), opts);
  }
  ```

- [ ] **7.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/lib/ai/extract.test.ts
  ```
  Output esperado: `5 passed`.

- [ ] **7.4 — `tsc` limpo + suíte inteira + commit.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  npx vitest run
  git add src/lib/ai/extract.ts src/lib/ai/extract.test.ts
  git commit -m "feat(ai): extractStructured — roteamento por role + retry + fallback Gemini"
  ```

---

## Fase 2 — Fluxo 1 (fatura, pipeline por target)

### T8 — `ImportTarget` + repository generalizado

**Files:**
- Modify: `src/modules/imports/types.ts` (adiciona `ImportTarget`)
- Modify: `src/modules/imports/repository.ts` (generaliza `findExistingFitIds`/`findFallbackRows`/`insertMany`)
- Modify: `src/modules/imports/errors.ts` (adiciona `CardNotFoundError`)

**Interfaces:**
- Produces: `ImportTarget = { kind: "account"; accountId: string } | { kind: "card"; cardId: string }`
- Consumes (não muda): `prisma`, `Prisma.TransactionClient`
- Produces (assinatura nova): `importRepository.findExistingFitIds(userId, target, fitIds, db?)`,
  `importRepository.findFallbackRows(userId, target, db?)`, `importRepository.insertMany(userId, target, items, db?)`
- Produces: `class CardNotFoundError extends ImportDomainError`

Sem migration nova: `Transaction.accountId`/`cardId` já são nullable no schema
(`prisma/schema.prisma`) — gravar `cardId` set + `accountId=null` não exige mudança de
schema. Sem índice único novo pro dedup de cartão: o dedup fallback de conta (sem
`fitId`) já é só em-app (multiset, sem constraint de banco — ver comentário de
`buildFallbackKeyCounts` em `service.ts`); manter a MESMA arquitetura pro cartão (não
inventar proteção que o caso análogo de conta não tem — ~/.claude/rules/02-dry-kiss-yagni.md,
YAGNI).

Sem teste automatizado dedicado nesta tarefa — `repository.ts` já não tinha testes antes
(mesmo padrão do resto do módulo `imports`, que é código de acesso a dado, não lógica
pura). A prova de que o dedup por `(data, valor)` funciona fica em T9 (função pura
`buildFallbackKey`, testável sem banco).

Passos:

- [ ] **8.1 — `ImportTarget` em `types.ts`.** Adicionar logo após o `import` do topo de
  `src/modules/imports/types.ts`:
  ```ts
  /**
   * Alvo de uma importação — conta (extrato) OU cartão (fatura,
   * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1").
   * Costuras target-específicas: dedup de conta usa `(data,valor,descrição)`, cartão usa só
   * `(data,valor)` (fatura não tem `fitId`, ver `service.ts` `buildFallbackKey`); insert de
   * cartão grava `cardId` set + `accountId=null` (ver `repository.ts` `insertMany`).
   */
  export type ImportTarget = { kind: "account"; accountId: string } | { kind: "card"; cardId: string };
  ```

- [ ] **8.2 — `CardNotFoundError` em `errors.ts`.** Adicionar ao final de
  `src/modules/imports/errors.ts`:
  ```ts
  /** Cartão informado não existe ou não pertence ao usuário (docs/10-AUTH.md, "Regra Principal de Segurança") — espelha `AccountNotFoundError` acima pro target `{kind:"card"}`. */
  export class CardNotFoundError extends ImportDomainError {
    constructor(cardId: string) {
      super(`Cartão não encontrado: ${cardId}`, "CARD_NOT_FOUND", undefined, { cardId });
    }
  }
  ```

- [ ] **8.3 — `tsc` limpo (types/errors ainda não são consumidos com a assinatura nova —
  só valida que os 2 arquivos compilam).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: erros em `repository.ts`/`service.ts` (assinatura antiga vs. `ImportTarget`
  ainda não usado) — normal, serão resolvidos nos próximos passos deste MESMO task antes
  do commit. Não commitar ainda.

- [ ] **8.4 — Generalizar `repository.ts`.** Reescrever
  `src/modules/imports/repository.ts` (mantém `Db`/`CommitItem`/`FallbackRow` como
  estavam, só as 3 funções mudam de assinatura):
  ```ts
  import { prisma } from "@/lib/db/client";
  import { Prisma } from "@/generated/prisma/client";
  import type { TransactionType } from "@/generated/prisma/enums";
  import type { ImportTarget } from "./types";

  type Db = Prisma.TransactionClient;

  export type CommitItem = {
    fitId: string | null;
    date: Date;
    amount: string;
    type: TransactionType;
    description: string;
    categoryId: string | null;
  };

  export type FallbackRow = { date: Date; amount: string; description: string };

  /**
   * Acesso a dados do módulo imports. SEMPRE escopado por `userId` + `deletedAt: null`
   * (docs/03-DATABASE.md, "Princípio Principal"). Generalizado por `ImportTarget`
   * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1") —
   * conta usa `fitId` (OFX); cartão NUNCA tem `fitId` (fatura em PDF não traz identificador
   * único de transação, mesma limitação que extrato em PDF já tinha) — `findExistingFitIds`
   * devolve `Set` vazio pra `target.kind === "card"` sem tocar o banco.
   */

  /** `fitId`s já existentes (não deletados) nesta CONTA, dentre os informados — insumo do
   * dedup (ver service.ts `previewImport`/`commitImport`). Cartão nunca usa `fitId`. */
  async function findExistingFitIds(
    userId: string,
    target: ImportTarget,
    fitIds: string[],
    db: Db = prisma,
  ): Promise<Set<string>> {
    if (fitIds.length === 0 || target.kind === "card") return new Set();

    const rows = await db.transaction.findMany({
      where: { userId, accountId: target.accountId, deletedAt: null, fitId: { in: fitIds } },
      select: { fitId: true },
    });

    return new Set(rows.flatMap((row) => (row.fitId ? [row.fitId] : [])));
  }

  /**
   * Transactions SEM `fitId` deste target — insumo do dedup de fallback. Pra conta é o raro
   * caso de `<STMTTRN>` sem `<FITID>`; pra cartão é o caso NORMAL (fatura em PDF nunca tem
   * `fitId`, sempre cai no fallback `(data,valor)` — ver service.ts `buildFallbackKey`).
   */
  async function findFallbackRows(userId: string, target: ImportTarget, db: Db = prisma): Promise<FallbackRow[]> {
    const where =
      target.kind === "account"
        ? { userId, accountId: target.accountId, deletedAt: null, fitId: null }
        : { userId, cardId: target.cardId, deletedAt: null, fitId: null };

    const rows = await db.transaction.findMany({
      where,
      select: { date: true, amount: true, description: true },
    });

    // `toFixed(2)` — mesmo racional do arquivo original (formato precisa bater com o lado
    // parseado, `Decimal.toFixed(2)` em todo `parsers/*.ts`).
    return rows.map((row) => ({ date: row.date, amount: row.amount.toFixed(2), description: row.description }));
  }

  /**
   * Insere as N Transactions já filtradas (sem duplicatas). `isPaid` sempre `true`
   * (docs/20-TRANSACTIONS.md). Cartão: `cardId` set, `accountId` null. Conta: o inverso —
   * mesmo par de campos, nunca os dois setados (schema.prisma, `Transaction.accountId`/`cardId`
   * ambos opcionais, mutuamente exclusivos por convenção do domínio, não por constraint de
   * banco).
   *
   * `skipDuplicates`: rede de segurança contra commit concorrente SÓ funciona pra CONTA
   * (índice único parcial `Transaction_accountId_fitId_key`, `fitId` não-null) — cartão nunca
   * tem `fitId`, então esse índice não protege fatura; o dedup de fatura é só em-app (mesmo
   * nível de proteção que o fallback-sem-fitId de conta já tinha, ver comentário em
   * `service.ts` `buildFallbackKeyCounts` — decisão consciente, não lacuna nova).
   */
  async function insertMany(userId: string, target: ImportTarget, items: CommitItem[], db: Db = prisma): Promise<number> {
    if (items.length === 0) return 0;

    const result = await db.transaction.createMany({
      skipDuplicates: true,
      data: items.map((item) => ({
        userId,
        accountId: target.kind === "account" ? target.accountId : null,
        cardId: target.kind === "card" ? target.cardId : null,
        description: item.description,
        type: item.type,
        amount: item.amount,
        categoryId: item.categoryId,
        date: item.date,
        isPaid: true,
        fitId: item.fitId,
      })),
    });

    return result.count;
  }

  export const importRepository = {
    findExistingFitIds,
    findFallbackRows,
    insertMany,
  };
  ```

- [ ] **8.5 — `tsc` — deve sobrar erro só em `service.ts` agora (chamadores com
  assinatura antiga).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: erros concentrados em `src/modules/imports/service.ts` (resolvidos em T9) —
  `repository.ts`/`types.ts`/`errors.ts` já compilam limpos isoladamente.

- [ ] **8.6 — Commit (junto — `repository.ts` sozinho não compila com `service.ts`
  desatualizado, mas o `tsc` do passo 8.5 confirma que o ESCOPO do erro é só
  `service.ts`, que é o próximo task).** Ainda assim, seguir a diretriz de commit por
  task: como T8 e T9 são interdependentes na prática (repository generalizado só fecha o
  build depois do service.ts seguir), fazer o commit de T8 JUNTO com o de T9 (ver 9.8) —
  não commitar T8 isolado com o build quebrado.

---

### T9 — `previewImport`/`commitImport` generalizados por `target` + `password`

**Files:**
- Modify: `src/modules/imports/service.ts`
- Create: `src/modules/imports/service.test.ts`

**Interfaces:**
- Consumes: `ImportTarget` (de `./types`), `importRepository` (de `./repository`), `parseImportFile` (de `./parsers`, assinatura nova em T11 — este task já assume `opts?` no chamado, T11 implementa o roteamento por dentro)
- Consumes: `cardRepository.findById` (de `@/modules/cards/repository`)
- Produces: `buildFallbackKey(target: ImportTarget, date: Date, amount: string, description: string): string` (exportado só pra teste — pura)
- Produces (assinatura nova): `importService.previewImport(userId, target, fileName, fileContent, password?)`,
  `importService.commitImport(userId, target, transactions, errors)`

Passos:

- [ ] **9.1 — Teste que falha primeiro (só a parte PURA — dedup key).** Criar
  `src/modules/imports/service.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { buildFallbackKey } from "./service";
  import type { ImportTarget } from "./types";

  const ACCOUNT: ImportTarget = { kind: "account", accountId: "acc_1" };
  const CARD: ImportTarget = { kind: "card", cardId: "card_1" };
  const DATE = new Date("2026-07-10T12:00:00-03:00");

  describe("buildFallbackKey", () => {
    it("conta: chave inclui data + valor + descrição", () => {
      const key = buildFallbackKey(ACCOUNT, DATE, "150.00", "Supermercado ABC");
      expect(key).toBe("2026-07-10|150.00|supermercado abc");
    });

    it("cartão: chave é SÓ data + valor (sem descrição) — spec: dedup de fatura é (data,valor)", () => {
      const key = buildFallbackKey(CARD, DATE, "150.00", "Loja qualquer");
      expect(key).toBe("2026-07-10|150.00");
    });

    it("cartão: 2 compras mesma data/valor mas descrição diferente colidem na MESMA chave (dedup mais agressivo que conta, por design)", () => {
      const keyA = buildFallbackKey(CARD, DATE, "50.00", "Uber");
      const keyB = buildFallbackKey(CARD, DATE, "50.00", "iFood");
      expect(keyA).toBe(keyB);
    });

    it("conta: mesma data/valor mas descrição diferente NÃO colide", () => {
      const keyA = buildFallbackKey(ACCOUNT, DATE, "50.00", "Uber");
      const keyB = buildFallbackKey(ACCOUNT, DATE, "50.00", "iFood");
      expect(keyA).not.toBe(keyB);
    });
  });
  ```
  ```bash
  npx vitest run src/modules/imports/service.test.ts
  ```
  Output esperado: falha (`buildFallbackKey` não é exportado ainda — a função hoje
  chama-se `fallbackKey` e é privada).

- [ ] **9.2 — Reescrever `service.ts` — ownership por target.** Substituir
  `assertAccountOwnership` por:
  ```ts
  import { cardRepository } from "@/modules/cards/repository";
  import { AccountNotFoundError, CardNotFoundError } from "./errors";
  import type { ImportTarget } from "./types";

  async function assertTargetOwnership(userId: string, target: ImportTarget): Promise<void> {
    if (target.kind === "account") {
      const account = await accountRepository.findById(userId, target.accountId);
      if (!account) throw new AccountNotFoundError(target.accountId);
      return;
    }

    const card = await cardRepository.findById(userId, target.cardId);
    if (!card) throw new CardNotFoundError(target.cardId);
  }
  ```

- [ ] **9.3 — `fallbackKey` → `buildFallbackKey` (exportada, target-aware).**
  ```ts
  /**
   * Chave de dedup do fallback sem `fitId` — target-aware (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Fluxo 1"): CONTA usa `(data,valor,descrição)` (mesma regra de sempre, docs/03-DATABASE.md
   * "Importação de Extrato OFX"); CARTÃO usa só `(data,valor)` — fatura de cartão não tem
   * `fitId` NUNCA (diferente do raro caso de conta), e o dono decidiu que 2 compras mesma
   * data/valor na fatura já contam como duplicata (parcela = gasto flat, sem campo extra pra
   * diferenciar). Dia-calendário em America/Sao_Paulo (`calendarPartsSP`), não
   * `date.toISOString()` — mesmo racional do arquivo original.
   *
   * Exportada (só pra teste — `service.test.ts`): função PURA, sem I/O.
   */
  export function buildFallbackKey(target: ImportTarget, date: Date, amount: string, description: string): string {
    const { year, month, day } = calendarPartsSP(date);
    if (target.kind === "card") return `${year}-${month}-${day}|${amount}`;
    return `${year}-${month}-${day}|${amount}|${description.trim().toLowerCase()}`;
  }
  ```

- [ ] **9.4 — Propagar `target` pelas funções de dedup em batch.**
  ```ts
  function buildFallbackKeyCounts(target: ImportTarget, rows: FallbackRow[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = buildFallbackKey(target, row.date, row.amount, row.description);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }

  type DedupState = { fitIds: Set<string>; fallbackCounts: Map<string, number> };

  function buildDedupState(target: ImportTarget, existingFitIds: Set<string>, fallbackRows: FallbackRow[]): DedupState {
    return { fitIds: existingFitIds, fallbackCounts: buildFallbackKeyCounts(target, fallbackRows) };
  }

  function isDuplicate(target: ImportTarget, item: ParsedTransaction, state: DedupState): boolean {
    if (item.fitId) {
      if (state.fitIds.has(item.fitId)) return true;
      state.fitIds.add(item.fitId);
      return false;
    }

    const key = buildFallbackKey(target, item.date, item.amount, item.description);
    const remaining = state.fallbackCounts.get(key) ?? 0;
    if (remaining <= 0) return false;

    state.fallbackCounts.set(key, remaining - 1);
    return true;
  }
  ```

- [ ] **9.5 — `previewImport`/`commitImport` com `target` + `password?`.**
  ```ts
  async function previewImport(
    userId: string,
    target: ImportTarget,
    fileName: string,
    fileContent: string,
    password?: string,
  ): Promise<ImportPreviewResult> {
    await assertTargetOwnership(userId, target);

    const { transactions, errors } = await parseImportFile(
      fileName,
      fileContent,
      target.kind === "card" ? { kind: "card", password } : undefined,
    );

    const withFitId = transactions.filter(hasFitId);
    const withoutFitId = transactions.filter((item) => !hasFitId(item));

    const [existingFitIds, fallbackRows] = await Promise.all([
      importRepository.findExistingFitIds(userId, target, withFitId.map((item) => item.fitId)),
      withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, target) : Promise.resolve([]),
    ]);
    const state = buildDedupState(target, existingFitIds, fallbackRows);

    let duplicados = 0;
    const novosParsed: ParsedTransaction[] = [];

    for (const item of transactions) {
      if (isDuplicate(target, item, state)) {
        duplicados += 1;
        continue;
      }
      novosParsed.push(item);
    }

    const novos: ImportPreviewItem[] = await Promise.all(
      novosParsed.map(async (item) => ({
        date: item.date,
        amount: item.amount,
        type: item.type,
        description: item.description,
        categoryName: await resolveCategoryName(userId, item.description),
      })),
    );

    return {
      preview: { total: transactions.length + errors.length, novos, duplicados, erros: errors },
      transactions,
    };
  }

  async function commitImport(
    userId: string,
    target: ImportTarget,
    transactions: ParsedTransaction[],
    errors: ImportParseError[],
  ): Promise<ImportCommitResult> {
    await assertTargetOwnership(userId, target);

    if (transactions.length === 0) return { imported: 0, duplicados: 0, erros: errors };

    const withCategory = await Promise.all(
      transactions.map(async (item) => ({ ...item, categoryId: await resolveCategoryId(userId, item.description) })),
    );

    const { imported, duplicados } = await prisma.$transaction(async (tx) => {
      const withFitId = withCategory.filter(hasFitId);
      const withoutFitId = withCategory.filter((item) => !hasFitId(item));

      const [existingFitIds, fallbackRows] = await Promise.all([
        importRepository.findExistingFitIds(userId, target, withFitId.map((item) => item.fitId), tx),
        withoutFitId.length > 0 ? importRepository.findFallbackRows(userId, target, tx) : Promise.resolve([]),
      ]);
      const state = buildDedupState(target, existingFitIds, fallbackRows);

      const toInsert = withCategory.filter((item) => !isDuplicate(target, item, state));
      const insertedCount = await importRepository.insertMany(userId, target, toInsert, tx);

      return { imported: insertedCount, duplicados: withCategory.length - insertedCount };
    });

    return { imported, duplicados, erros: errors };
  }

  export const importService = { previewImport, commitImport };
  ```
  `resolveCategoryName`/`resolveCategoryId`/`hasFitId` continuam EXATAMENTE como
  estavam (não mudam — reusados sem alteração).

- [ ] **9.6 — Rodar o teste puro e ver passar.**
  ```bash
  npx vitest run src/modules/imports/service.test.ts
  ```
  Output esperado: `4 passed`.

- [ ] **9.7 — `tsc` — deve sobrar erro só em `parsers/index.ts`/`actions.ts` agora
  (assinatura de `parseImportFile` ainda antiga — T11; `actions.ts` ainda chama
  `previewImport`/`commitImport` com `accountId` solto — T12).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```

- [ ] **9.8 — Commit de T8+T9 juntos (repository + service fecham o build um do
  outro).**
  ```bash
  git add src/modules/imports/types.ts src/modules/imports/errors.ts src/modules/imports/repository.ts src/modules/imports/service.ts src/modules/imports/service.test.ts
  git commit -m "feat(imports): generaliza pipeline de import por ImportTarget (conta|cartão)"
  ```

---

### T10 — `card-invoice-parser.ts` + extração de `normalize.ts`

**Files:**
- Create: `src/modules/imports/parsers/normalize.ts` (extraído de `pdf-parser.ts` — reuso literal, não duplicação)
- Create: `src/modules/imports/parsers/normalize.test.ts`
- Modify: `src/modules/imports/parsers/pdf-parser.ts` (passa a importar de `./normalize`, remove duplicação — comportamento observável INALTERADO)
- Create: `src/modules/imports/parsers/card-invoice-parser.ts`
- Create: `src/modules/imports/parsers/card-invoice-parser.test.ts`

**Interfaces:**
- Produces: `parseTransactionEnvelope(rawJson: unknown): unknown[] | null`, `normalizeTransactionItem(raw: unknown): { transaction: ParsedTransaction } | { error: ImportParseError }`, `safeSnippet`, `parseIsoDateSP`, `normalizeAmount`, `transactionItemSchema` (de `normalize.ts`)
- Consumes: `extractPdfText`, `PdfPasswordError` (de `@/lib/pdf/extract-text`), `extractStructured` (de `@/lib/ai/extract`)
- Produces: `parseCardInvoice(bytes: Buffer, password?: string): Promise<ImportParseResult>`

Passos:

- [ ] **10.1 — Teste que falha primeiro (`normalize.ts`, funções puras).** Criar
  `src/modules/imports/parsers/normalize.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { normalizeAmount, normalizeTransactionItem, parseIsoDateSP, parseTransactionEnvelope, safeSnippet } from "./normalize";

  describe("parseTransactionEnvelope", () => {
    it("aceita { transactions: [...] }", () => {
      expect(parseTransactionEnvelope({ transactions: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    });

    it("rejeita shape sem transactions", () => {
      expect(parseTransactionEnvelope({ foo: "bar" })).toBeNull();
    });
  });

  describe("normalizeAmount", () => {
    it("normaliza pra 2 casas decimais", () => {
      expect(normalizeAmount("150.5")).toBe("150.50");
      expect(normalizeAmount("50")).toBe("50.00");
    });
  });

  describe("parseIsoDateSP", () => {
    it("aceita YYYY-MM-DD válido", () => {
      expect(parseIsoDateSP("2026-07-10")).not.toBeNull();
    });

    it("rejeita mês/dia fora de faixa", () => {
      expect(parseIsoDateSP("2026-13-01")).toBeNull();
      expect(parseIsoDateSP("2026-01-40")).toBeNull();
    });
  });

  describe("normalizeTransactionItem", () => {
    it("normaliza item válido pra ParsedTransaction com fitId null", () => {
      const result = normalizeTransactionItem({ date: "2026-07-10", amount: "99.9", type: "EXPENSE", description: "  Mercado  " });
      expect(result).toEqual({
        transaction: { fitId: null, date: expect.any(Date), amount: "99.90", type: "EXPENSE", description: "Mercado" },
      });
    });

    it("vira erro isolado quando o shape do item não bate", () => {
      const result = normalizeTransactionItem({ date: "não é data", amount: "x", type: "EXPENSE" });
      expect("error" in result).toBe(true);
    });

    it("vira erro isolado quando a data é inválida mesmo com shape ok", () => {
      const result = normalizeTransactionItem({ date: "2026-13-40", amount: "10.00", type: "EXPENSE", description: "x" });
      expect("error" in result).toBe(true);
    });
  });

  describe("safeSnippet", () => {
    it("serializa em JSON", () => {
      expect(safeSnippet({ a: 1 })).toBe('{"a":1}');
    });
  });
  ```
  ```bash
  npx vitest run src/modules/imports/parsers/normalize.test.ts
  ```
  Output esperado: falha (módulo `./normalize` não existe).

- [ ] **10.2 — Criar `normalize.ts`** (extraído 1:1 de `pdf-parser.ts` — mesma lógica,
  agora reusável por `card-invoice-parser.ts`):
  ```ts
  import { z } from "zod";
  import { Prisma } from "@/generated/prisma/client";
  import { startOfDaySP } from "@/lib/date/calendar-sp";
  import type { ImportParseError, ParsedTransaction } from "../types";

  /**
   * Normalização/validação COMPARTILHADA entre `pdf-parser.ts` (extrato) e
   * `card-invoice-parser.ts` (fatura) — extraído aqui pra reuso literal (~/.claude/rules/02-dry-kiss-yagni.md,
   * DRY a partir do 2º caso concreto real: os dois parsers produzem exatamente o mesmo shape
   * de item — `{date, amount, type, description}` — a partir de uma IA). Erro-como-dado: item
   * malformado individual vira `ImportParseError` isolado, NUNCA descarta o documento inteiro.
   */

  const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
  const DECIMAL_STRING_REGEX = /^\d+(\.\d+)?$/;

  export const isoDateSchema = z.string().regex(ISO_DATE_REGEX, "esperado YYYY-MM-DD");
  export const decimalStringSchema = z.string().regex(DECIMAL_STRING_REGEX, "esperado string decimal com ponto");

  export const transactionItemSchema = z.object({
    date: isoDateSchema,
    amount: decimalStringSchema,
    type: z.enum(["EXPENSE", "INCOME"]),
    description: z.string().min(1),
  });

  export function safeSnippet(raw: unknown): string {
    try {
      return JSON.stringify(raw);
    } catch {
      return "";
    }
  }

  /** Bounds checadas antes de `startOfDaySP` — evita `Date` rolando pra outro mês (ex.: dia 40) silenciosamente. */
  export function parseIsoDateSP(isoDate: string): Date | null {
    const match = isoDate.match(ISO_DATE_REGEX);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    return startOfDaySP(year, month, day);
  }

  export function normalizeAmount(amount: string): string {
    return new Prisma.Decimal(amount).toFixed(2);
  }

  /** Só valida a ENVOLTÓRIA `{ transactions: [...] }` — cada item é validado individualmente
   * por `normalizeTransactionItem`, pra um item malformado virar erro isolado em vez de
   * descartar o documento inteiro. */
  export function parseTransactionEnvelope(rawJson: unknown): unknown[] | null {
    const envelope = z.object({ transactions: z.array(z.unknown()) }).safeParse(rawJson);
    return envelope.success ? envelope.data.transactions : null;
  }

  export function normalizeTransactionItem(raw: unknown): { transaction: ParsedTransaction } | { error: ImportParseError } {
    const parsed = transactionItemSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        error: {
          snippet: safeSnippet(raw),
          reason: `Lançamento com formato inesperado: ${parsed.error.issues[0]?.message ?? "erro de validação"}`,
        },
      };
    }

    const date = parseIsoDateSP(parsed.data.date);
    if (!date) {
      return { error: { snippet: safeSnippet(raw), reason: `Data inválida: "${parsed.data.date}"` } };
    }

    return {
      transaction: {
        fitId: null,
        date,
        amount: normalizeAmount(parsed.data.amount),
        type: parsed.data.type,
        description: parsed.data.description.trim(),
      },
    };
  }
  ```

- [ ] **10.3 — Rodar `normalize.test.ts` e ver passar.**
  ```bash
  npx vitest run src/modules/imports/parsers/normalize.test.ts
  ```
  Output esperado: `9 passed`.

- [ ] **10.4 — Refatorar `pdf-parser.ts` pra usar `normalize.ts`** (remove
  `ISO_DATE_REGEX`/`DECIMAL_STRING_REGEX`/`isoDateSchema`/`decimalStringSchema`/
  `pdfTransactionItemSchema`/`parseExtractionEnvelope`/`safeSnippet`/`parseIsoDateSP`/
  `normalizeItem` locais — troca por import). Novo topo de
  `src/modules/imports/parsers/pdf-parser.ts`:
  ```ts
  import { Prisma } from "@/generated/prisma/client";
  import { callGemini, type GeminiContentPart } from "@/lib/ai/gemini";
  import type { ImportParseError, ImportParseResult, ParsedTransaction } from "../types";
  import { normalizeTransactionItem, parseTransactionEnvelope } from "./normalize";
  ```
  E o corpo de `parsePdfStatement` passa a chamar `parseTransactionEnvelope`/
  `normalizeTransactionItem` no lugar das versões locais removidas:
  ```ts
  export async function parsePdfStatement(base64Content: string): Promise<ImportParseResult> {
    const parts: GeminiContentPart[] = [
      { inlineData: { mimeType: "application/pdf", data: base64Content } },
      { text: buildPdfPrompt() },
    ];

    const rawItems = await callGemini(
      [{ parts }],
      "pdf-import-statement",
      PDF_RESPONSE_SCHEMA,
      parseTransactionEnvelope,
      PDF_TIMEOUT_MS,
    );

    if (rawItems === null) {
      return {
        transactions: [],
        errors: [{ snippet: "", reason: "Não foi possível extrair as transações do PDF (tente novamente em instantes ou use outro formato)." }],
      };
    }

    const transactions: ParsedTransaction[] = [];
    const errors: ImportParseError[] = [];

    for (const raw of rawItems) {
      const result = normalizeTransactionItem(raw);
      if ("error" in result) errors.push(result.error);
      else transactions.push(result.transaction);
    }

    return { transactions, errors };
  }
  ```
  `PDF_TIMEOUT_MS`, `PDF_RESPONSE_SCHEMA`, `buildPdfPrompt` continuam EXATAMENTE como
  estavam — só a normalização foi extraída. Remover o import de `Prisma` se sobrar sem
  uso após a limpeza (checar com `tsc`).

- [ ] **10.5 — Regressão: suíte inteira ainda passa (comportamento de `parsePdfStatement`
  inalterado — refactor puro).**
  ```bash
  npx vitest run
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: nenhuma regressão; erro de `tsc` (se sobrar) só nos arquivos ainda não
  ajustados de T9 (parsers/index.ts, actions.ts — normal até T11/T12).

- [ ] **10.6 — Teste que falha primeiro para `card-invoice-parser.ts`.** Criar
  `src/modules/imports/parsers/card-invoice-parser.test.ts` (usa as 2 fixtures reais de
  T1 — pula automaticamente se `NVIDIA_API_KEY` não estiver setada, já que é uma chamada
  de rede real contra a NIM, não mockada — mesmo racional de rodar contra os documentos
  reais que o spec pede):
  ```ts
  import { describe, expect, it } from "vitest";
  import { existsSync, readFileSync } from "node:fs";
  import { join } from "node:path";
  import { parseCardInvoice } from "./card-invoice-parser";

  const FATURA_PATH = join(__dirname, "../../../lib/pdf/__fixtures__/fatura-com-senha.pdf");
  const NUBANK_PATH = join(__dirname, "../../../lib/pdf/__fixtures__/nubank-sem-senha.pdf");
  const canRunLive = Boolean(process.env.NVIDIA_API_KEY) && existsSync(FATURA_PATH) && existsSync(NUBANK_PATH);

  describe.skipIf(!canRunLive)("parseCardInvoice (chamada real à NIM — precisa de NVIDIA_API_KEY + fixtures)", () => {
    it("extrai lançamentos de uma fatura COM senha", async () => {
      const bytes = readFileSync(FATURA_PATH);
      const result = await parseCardInvoice(bytes, "028574373");
      expect(result.transactions.length).toBeGreaterThan(0);
      for (const transaction of result.transactions) {
        expect(["EXPENSE", "INCOME"]).toContain(transaction.type);
        expect(transaction.fitId).toBeNull();
      }
    }, 120_000);

    it("extrai lançamentos de um PDF SEM senha", async () => {
      const bytes = readFileSync(NUBANK_PATH);
      const result = await parseCardInvoice(bytes);
      expect(result.transactions.length).toBeGreaterThan(0);
    }, 120_000);

    it("senha errada vira erro isolado, não lança", async () => {
      const bytes = readFileSync(FATURA_PATH);
      const result = await parseCardInvoice(bytes, "senha-errada-000");
      expect(result.transactions).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]!.reason).toMatch(/senha/i);
    }, 30_000);
  });

  describe("parseCardInvoice (sem rede — smoke de erro-como-dado)", () => {
    it("PDF corrompido/inválido vira erro isolado, nunca lança", async () => {
      const result = await parseCardInvoice(Buffer.from("não é um pdf"));
      expect(result.transactions).toEqual([]);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
  ```
  ```bash
  npx vitest run src/modules/imports/parsers/card-invoice-parser.test.ts
  ```
  Output esperado: falha de resolução de módulo `./card-invoice-parser` (os testes com
  `describe.skipIf` ainda contam como falha de import, não de asserção).

- [ ] **10.7 — Implementação de `card-invoice-parser.ts`.** Criar
  `src/modules/imports/parsers/card-invoice-parser.ts`:
  ```ts
  import { extractPdfText, PdfPasswordError } from "@/lib/pdf/extract-text";
  import { extractStructured } from "@/lib/ai/extract";
  import type { JsonSchema } from "@/lib/ai/types";
  import type { ImportParseError, ImportParseResult, ParsedTransaction } from "../types";
  import { normalizeTransactionItem, parseTransactionEnvelope } from "./normalize";

  /**
   * Parser de FATURA de cartão em PDF (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Fluxo 1") — via camada de IA nova (`@/lib/ai/extract`), NUNCA chama `nvidia.ts`/`gemini.ts`
   * direto (DIP — só conhece a porta `extractStructured`, nem sabe que hoje é NVIDIA).
   *
   * PDF com text layer → `extractPdfText` → texto → `role: "document-text"` (deepseek,
   * text-only). PDF escaneado/foto (sem text layer) → `role: "document-vision"` (qwen VLM) —
   * ATENÇÃO: este caminho manda os BYTES CRUS do PDF como `image_url` com
   * `mimeType: "application/pdf"`; se o spike (T2) confirmar que o qwen da NIM não aceita PDF
   * inline pra visão (só imagem rasterizada), essa combinação específica retorna `null` (vira
   * o erro genérico abaixo) até uma melhoria futura de renderizar a 1ª página em PNG (fora de
   * escopo deste plano — precisaria de `sharp` + `unpdf/extractImages`, ver "Improvement
   * Suggestions" no relatório da tarefa).
   *
   * Regras de linha (spec, "Fatura — linhas"): compras + encargos = EXPENSE; estornos =
   * INCOME; pagamento de fatura anterior / saldo anterior = IGNORADOS (nem aparecem no
   * envelope). Parcela = gasto flat — cada linha de parcela vira 1 EXPENSE isolada
   * (agrupamento em `InstallmentPurchase` é fase 2, fora deste parser).
   *
   * NUNCA lança: senha errada/faltando (`PdfPasswordError`) e falha de extração (IA fora do
   * ar, JSON malformado) viram `ImportParseError` isolado — mesmo contrato de
   * `pdf-parser.ts`/`ofx-parser.ts`/`csv-parser.ts`. NUNCA loga o texto do documento nem a
   * senha (mesmo racional de `lib/ai/gemini.ts`).
   */

  const INVOICE_RESPONSE_SCHEMA: JsonSchema = {
    type: "object",
    properties: {
      transactions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            amount: { type: "string" },
            type: { type: "string", enum: ["EXPENSE", "INCOME"] },
            description: { type: "string" },
          },
          required: ["date", "amount", "type", "description"],
        },
      },
    },
    required: ["transactions"],
  };

  function buildInvoicePrompt(): string {
    return [
      "Você extrai TODOS os lançamentos de uma FATURA DE CARTÃO DE CRÉDITO (pt-BR) de bancos diferentes — o layout muda, mas cada linha de compra/encargo/estorno representa um lançamento.",
      "",
      "Para CADA lançamento da fatura, preencha um item de `transactions` com:",
      '- `date`: data da COMPRA (não a data de vencimento da fatura), formato ISO YYYY-MM-DD (ano corrente quando a fatura omitir o ano).',
      '- `amount`: valor ABSOLUTO (sempre positivo, sem sinal), string decimal com PONTO decimal, sem separador de milhar e sem símbolo de moeda (ex.: "150.30"). Converta vírgula decimal (padrão BR) para ponto.',
      '- `type`: "EXPENSE" pra compras E encargos (juros, IOF, anuidade, multa) — "INCOME" SÓ pra estornos/créditos a favor do titular.',
      "- `description`: descrição da compra como aparece na fatura (nome do estabelecimento), resumida.",
      "",
      'Se a compra estiver PARCELADA (ex.: "Loja X 3/12"), cada parcela listada na fatura é um item INDEPENDENTE — NÃO some as parcelas, NÃO tente reconstruir o valor total da compra, cada linha vira 1 item.',
      "",
      "IGNORE completamente (NÃO viram item): pagamento da fatura anterior (\"pagamento recebido\", \"pagto fatura\"), saldo anterior, total da fatura, limite disponível, cabeçalho, rodapé, número de página.",
      "Se a fatura não tiver NENHUM lançamento identificável, retorne `transactions: []` — NUNCA invente um lançamento que não está no documento.",
    ].join("\n");
  }

  function buildErrorResult(reason: string): ImportParseResult {
    return { transactions: [], errors: [{ snippet: "", reason }] };
  }

  export async function parseCardInvoice(bytes: Buffer, password?: string): Promise<ImportParseResult> {
    let extraction: { text: string; hasTextLayer: boolean };
    try {
      extraction = await extractPdfText(bytes, password);
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        return buildErrorResult("PDF protegido por senha — senha incorreta ou não informada.");
      }
      console.error("[modules/imports/parsers/card-invoice-parser] extractPdfText failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
      return buildErrorResult("Não foi possível ler o PDF da fatura.");
    }

    const prompt = buildInvoicePrompt();
    const rawItems = extraction.hasTextLayer
      ? await extractStructured("document-text", { kind: "text", text: extraction.text }, prompt, INVOICE_RESPONSE_SCHEMA, parseTransactionEnvelope)
      : await extractStructured("document-vision", { kind: "vision", bytes, mimeType: "application/pdf" }, prompt, INVOICE_RESPONSE_SCHEMA, parseTransactionEnvelope);

    if (rawItems === null) {
      return buildErrorResult("Não foi possível extrair os lançamentos da fatura (tente novamente em instantes).");
    }

    const transactions: ParsedTransaction[] = [];
    const errors: ImportParseError[] = [];

    for (const raw of rawItems) {
      const result = normalizeTransactionItem(raw);
      if ("error" in result) errors.push(result.error);
      else transactions.push(result.transaction);
    }

    return { transactions, errors };
  }
  ```

- [ ] **10.8 — Rodar e ver passar.**
  ```bash
  npx vitest run src/modules/imports/parsers/card-invoice-parser.test.ts
  ```
  Output esperado (sem `NVIDIA_API_KEY` no ambiente de CI): `1 passed | 3 skipped`.
  **Rodar localmente com `NVIDIA_API_KEY` setada pelo menos 1 vez antes de considerar T10
  concluída de verdade** — os 3 testes pulados são os que de fato validam a extração
  contra as 2 faturas reais (requisito explícito do spec, seção "Testes").
  ```bash
  node --env-file=.env ./node_modules/.bin/vitest run src/modules/imports/parsers/card-invoice-parser.test.ts
  ```

- [ ] **10.9 — `tsc` limpo + commit.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  git add src/modules/imports/parsers/normalize.ts src/modules/imports/parsers/normalize.test.ts src/modules/imports/parsers/pdf-parser.ts src/modules/imports/parsers/card-invoice-parser.ts src/modules/imports/parsers/card-invoice-parser.test.ts
  git commit -m "feat(imports): card-invoice-parser (fatura via NVIDIA) + normalize.ts compartilhado"
  ```

---

### T11 — Roteamento em `parsers/index.ts`

**Files:**
- Modify: `src/modules/imports/parsers/index.ts`
- Create: `src/modules/imports/parsers/index.test.ts`

**Interfaces:**
- Produces (assinatura nova): `parseImportFile(fileName: string, content: string, opts?: { kind?: "account" | "card"; password?: string }): Promise<ImportParseResult>`

Passos:

- [ ] **11.1 — Teste que falha primeiro (mocka os parsers concretos, testa só
  roteamento).** Criar `src/modules/imports/parsers/index.test.ts`:
  ```ts
  import { describe, expect, it, vi } from "vitest";

  const parseCardInvoiceMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });
  const parsePdfStatementMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });
  const parseOfxMock = vi.fn().mockResolvedValue({ transactions: [], errors: [] });

  vi.mock("./card-invoice-parser", () => ({ parseCardInvoice: parseCardInvoiceMock }));
  vi.mock("./pdf-parser", () => ({ parsePdfStatement: parsePdfStatementMock }));
  vi.mock("./ofx-parser", () => ({ parseOfx: parseOfxMock }));
  vi.mock("./csv-parser", () => ({ parseCsv: vi.fn() }));
  vi.mock("./xlsx-parser", () => ({ parseXlsx: vi.fn() }));

  const { parseImportFile } = await import("./index");

  describe("parseImportFile — roteamento", () => {
    it("PDF + kind='card' vai pro card-invoice-parser com bytes decodificados de base64 + senha", async () => {
      const base64 = Buffer.from("conteudo-fake").toString("base64");
      await parseImportFile("fatura.pdf", base64, { kind: "card", password: "1234" });

      expect(parseCardInvoiceMock).toHaveBeenCalledWith(Buffer.from(base64, "base64"), "1234");
      expect(parsePdfStatementMock).not.toHaveBeenCalled();
    });

    it("PDF sem kind (ou kind='account') vai pro pdf-parser existente (Gemini) — comportamento de extrato INALTERADO", async () => {
      const base64 = Buffer.from("conteudo-fake").toString("base64");
      await parseImportFile("extrato.pdf", base64);

      expect(parsePdfStatementMock).toHaveBeenCalledWith(base64);
      expect(parseCardInvoiceMock).not.toHaveBeenCalled();
    });

    it("OFX continua indo pro parseOfx de sempre, independente de kind", async () => {
      await parseImportFile("extrato.ofx", "conteudo ofx", { kind: "card" });
      expect(parseOfxMock).toHaveBeenCalledWith("conteudo ofx");
    });
  });
  ```
  ```bash
  npx vitest run src/modules/imports/parsers/index.test.ts
  ```
  Output esperado: falha (assinatura antiga de `parseImportFile` não aceita `opts`, e
  `parseCardInvoice` não é chamado por lugar nenhum ainda).

- [ ] **11.2 — Implementação.** Modificar `src/modules/imports/parsers/index.ts`:
  ```ts
  import type { ImportParseResult } from "../types";
  import { parseOfx } from "./ofx-parser";
  import { parseCsv } from "./csv-parser";
  import { parseXlsx } from "./xlsx-parser";
  import { parsePdfStatement } from "./pdf-parser";
  import { parseCardInvoice } from "./card-invoice-parser";

  function detectExtension(fileName: string): string {
    const trimmed = fileName.trim().toLowerCase();
    const dotIndex = trimmed.lastIndexOf(".");
    return dotIndex === -1 ? "" : trimmed.slice(dotIndex + 1);
  }

  export type ParseImportOpts = { kind?: "account" | "card"; password?: string };

  /**
   * Ponto único de entrada do parse — generalizado por `opts.kind`
   * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1"):
   * PDF + `kind==="card"` vai pro parser NOVO (`card-invoice-parser.ts`, NVIDIA); qualquer
   * outro caso de PDF (extrato de conta, `kind` ausente/"account") continua 100% no caminho
   * ORIGINAL (`pdf-parser.ts`, Gemini) — comportamento de extrato de conta INALTERADO
   * (regressão coberta em T18). CSV/XLSX/OFX não mudam pra cartão — só o INSERT muda
   * (`repository.ts`), o parse continua idêntico pros dois targets.
   */
  export async function parseImportFile(fileName: string, content: string, opts?: ParseImportOpts): Promise<ImportParseResult> {
    const extension = detectExtension(fileName);

    if (extension === "pdf" && opts?.kind === "card") {
      return parseCardInvoice(Buffer.from(content, "base64"), opts.password);
    }

    if (extension === "ofx") return parseOfx(content);
    if (extension === "csv") return parseCsv(content);
    if (extension === "xlsx") return parseXlsx(content);
    if (extension === "pdf") return parsePdfStatement(content);
    if (extension === "xls") {
      return {
        transactions: [],
        errors: [{ snippet: fileName, reason: 'Formato ".xls" (binário antigo) não suportado — exporte o extrato como .xlsx ou .csv.' }],
      };
    }

    return {
      transactions: [],
      errors: [{ snippet: fileName, reason: `Formato de arquivo não suportado: ".${extension || "?"}"` }],
    };
  }
  ```

- [ ] **11.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/modules/imports/parsers/index.test.ts
  ```
  Output esperado: `3 passed`.

- [ ] **11.4 — `tsc` — deve sobrar erro só em `actions.ts`/`schemas.ts` agora (T12).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```

- [ ] **11.5 — Commit.**
  ```bash
  git add src/modules/imports/parsers/index.ts src/modules/imports/parsers/index.test.ts
  git commit -m "feat(imports): roteia PDF de fatura de cartão pro parser NVIDIA por opts.kind"
  ```

---

### T12 — `schemas.ts` + `actions.ts` aceitam `target` + `password?`

**Files:**
- Modify: `src/modules/imports/schemas.ts`
- Modify: `src/modules/imports/actions.ts`

**Interfaces:**
- Produces: `importTargetSchema` (zod discriminated union), `ImportInput`, `CommitImportInput` (tipos atualizados)
- Produces (assinatura nova): `previewImportAction(target: ImportTarget, fileName: string, fileContent: string, password?: string): Promise<ActionResult<ImportPreviewResult>>`,
  `commitImportAction(target: ImportTarget, transactions: ParsedTransaction[], errors: ImportParseError[]): Promise<ActionResult<ImportCommitResult>>`

Sem teste novo dedicado — `actions.ts` é boundary fino (parse zod → delega pro service),
mesmo padrão de zero-teste-de-actions já estabelecido no resto do módulo `imports`; a
lógica de negócio por trás (dedup/ownership) já está coberta em T9.

Passos:

- [ ] **12.1 — Reescrever `schemas.ts`.**
  ```ts
  import { z } from "zod";

  const MAX_FILE_CONTENT_LENGTH = 5_000_000;
  const MAX_TRANSACTIONS = 20_000;

  /** Espelha `ImportTarget` (`types.ts`) em zod — discriminated union garante que só um dos
   * dois ids (accountId|cardId) chega na action, nunca os dois nem nenhum. */
  export const importTargetSchema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("account"), accountId: z.string().trim().min(1, "Conta é obrigatória") }),
    z.object({ kind: z.literal("card"), cardId: z.string().trim().min(1, "Cartão é obrigatório") }),
  ]);

  export const importSchema = z.object({
    target: importTargetSchema,
    fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório"),
    fileContent: z.string().min(1, "Arquivo vazio").max(MAX_FILE_CONTENT_LENGTH, "Arquivo muito grande"),
    /** Senha do PDF (fatura cifrada) — opcional, só relevante pra target cartão + arquivo PDF (`card-invoice-parser.ts`). */
    password: z.string().trim().min(1).optional(),
  });

  export type ImportInput = z.infer<typeof importSchema>;

  const parsedTransactionSchema = z.object({
    fitId: z.string().nullable(),
    date: z.coerce.date(),
    amount: z.string().trim().min(1),
    type: z.enum(["INCOME", "EXPENSE"]),
    description: z.string(),
  });

  const parseErrorSchema = z.object({ snippet: z.string(), reason: z.string() });

  export const commitImportSchema = z.object({
    target: importTargetSchema,
    transactions: z.array(parsedTransactionSchema).max(MAX_TRANSACTIONS, "Extrato muito grande"),
    errors: z.array(parseErrorSchema),
  });

  export type CommitImportInput = z.infer<typeof commitImportSchema>;
  ```

- [ ] **12.2 — Reescrever `actions.ts`.**
  ```ts
  "use server";

  import { revalidatePath } from "next/cache";
  import { auth } from "@/lib/auth";
  import { importService } from "./service";
  import { commitImportSchema, importSchema } from "./schemas";
  import { ImportDomainError } from "./errors";
  import type { ActionResult, ImportCommitResult, ImportParseError, ImportPreviewResult, ImportTarget, ParsedTransaction } from "./types";

  async function requireUserId(): Promise<string | null> {
    const session = await auth();
    return session?.user?.id ?? null;
  }

  const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

  function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
    if (error instanceof ImportDomainError) {
      return { success: false, error: { code: error.code, message: error.message } };
    }
    console.error("[modules/imports] unexpected error", error);
    return { success: false, error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." } };
  }

  /** Invalida as rotas certas por target — cartão nunca revalida `/accounts` e vice-versa. */
  function revalidateForTarget(target: ImportTarget): void {
    if (target.kind === "account") {
      revalidatePath("/accounts");
      revalidatePath(`/accounts/${target.accountId}`);
    } else {
      revalidatePath("/cards");
      revalidatePath(`/cards/${target.cardId}`);
    }
    revalidatePath("/dashboard");
  }

  export async function previewImportAction(
    target: ImportTarget,
    fileName: string,
    fileContent: string,
    password?: string,
  ): Promise<ActionResult<ImportPreviewResult>> {
    const userId = await requireUserId();
    if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

    const parsed = importSchema.safeParse({ target, fileName, fileContent, password });
    if (!parsed.success) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." } };
    }

    try {
      const result = await importService.previewImport(
        userId,
        parsed.data.target,
        parsed.data.fileName,
        parsed.data.fileContent,
        parsed.data.password,
      );
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  }

  export async function commitImportAction(
    target: ImportTarget,
    transactions: ParsedTransaction[],
    errors: ImportParseError[],
  ): Promise<ActionResult<ImportCommitResult>> {
    const userId = await requireUserId();
    if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

    const parsed = commitImportSchema.safeParse({ target, transactions, errors });
    if (!parsed.success) {
      return { success: false, error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." } };
    }

    try {
      const result = await importService.commitImport(userId, parsed.data.target, parsed.data.transactions, parsed.data.errors);
      revalidateForTarget(parsed.data.target);
      return { success: true, data: result };
    } catch (error) {
      return toActionError(error);
    }
  }
  ```

- [ ] **12.3 — `tsc` limpo (fecha TODO o build do módulo `imports` — última peça do
  backend do Fluxo 1).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: zero erros em `src/modules/imports/**`. Erros restantes (se houver) só em
  `src/components/accounts/*` — resolvidos em T16 (o front ainda chama
  `previewImportAction(accountId, ...)` com a assinatura antiga até lá).

- [ ] **12.4 — Suíte inteira + commit.**
  ```bash
  npx vitest run
  git add src/modules/imports/schemas.ts src/modules/imports/actions.ts
  git commit -m "feat(imports): actions de preview/commit aceitam target + password"
  ```

---

## Fase 3 — Fluxo 2 (contrato de financiamento)

### T13 — `parseFinancingFromDocument` usa a camada de IA nova

**Files:**
- Modify: `src/modules/telegram/financing-parser.ts`
- Create: `src/modules/telegram/financing-parser.test.ts`

**Interfaces:**
- Consumes: `extractPdfText`, `PdfPasswordError` (de `@/lib/pdf/extract-text`), `extractStructured` (de `@/lib/ai/extract`)
- Produces (assinatura nova): `parseFinancingFromDocument(documentBytes: Buffer, mimeType: string, password?: string): Promise<ParsedFinancing | null>` (contrato de retorno INALTERADO — `ParsedFinancing | null`, mesmo shape de sempre)

Correção do coordenador (reverte a decisão anterior de usar nemotron por padrão —
instrução explícita do dono: **thinking/reasoning OFF por padrão, ligar SÓ por medição**,
nunca por suposição de que um documento "parece complexo"): PDF de contrato com text
layer usa `role: "document-text"` — o MESMO role da fatura (deepseek, `thinking:false`),
sem tratamento especial. `role: "document-text-reasoning"` (nemotron) SÓ entra depois que
uma medição concreta (rodar `parseFinancingFromDocument` contra um contrato real e
observar `principal`/`assetValue`/`downPayment` trocados) mostrar que o deepseek erra —
ver nota condicional no final desta tarefa (13.6), não é o comportamento default deste
código. Path de visão (foto do contrato) continua `role: "document-vision"` (qwen), igual
fatura. Nenhum contrato real de financiamento estava disponível nos fixtures pra um teste
`skipIf` "contra documento real" como o de `card-invoice-parser.ts` (T10) — o teste desta
tarefa é 100% mockado (roteamento por role + erro-como-dado). Se o dono tiver um PDF de
CCB real mais adiante, adicionar um teste `describe.skipIf` espelhando
`card-invoice-parser.test.ts` é o próximo passo natural (ver "Improvement Suggestions" no
relatório final).

Passos:

- [ ] **13.1 — Teste que falha primeiro.** Criar `src/modules/telegram/financing-parser.test.ts`:
  ```ts
  import { describe, expect, it, vi } from "vitest";

  const extractPdfTextMock = vi.fn();
  const extractStructuredMock = vi.fn();

  class FakePdfPasswordError extends Error {}

  vi.mock("@/lib/pdf/extract-text", () => ({
    extractPdfText: extractPdfTextMock,
    PdfPasswordError: FakePdfPasswordError,
  }));
  vi.mock("@/lib/ai/extract", () => ({ extractStructured: extractStructuredMock }));

  const { parseFinancingFromDocument } = await import("./financing-parser");

  describe("parseFinancingFromDocument", () => {
    it("PDF com text layer usa role document-text (deepseek, thinking off — MESMO role da fatura, sem reasoning por padrão)", async () => {
      extractPdfTextMock.mockResolvedValueOnce({ text: "texto do contrato", hasTextLayer: true });
      extractStructuredMock.mockResolvedValueOnce({ principal: "1000.00" });

      const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

      expect(result).toEqual({ principal: "1000.00" });
      expect(extractStructuredMock).toHaveBeenCalledWith(
        "document-text",
        { kind: "text", text: "texto do contrato" },
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("PDF SEM text layer (escaneado) usa role document-vision", async () => {
      extractPdfTextMock.mockResolvedValueOnce({ text: "", hasTextLayer: false });
      extractStructuredMock.mockResolvedValueOnce(null);

      await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

      expect(extractStructuredMock).toHaveBeenCalledWith(
        "document-vision",
        { kind: "vision", bytes: expect.any(Buffer), mimeType: "application/pdf" },
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("foto (não-PDF) usa role document-vision direto, sem tentar extractPdfText", async () => {
      extractStructuredMock.mockResolvedValueOnce({ lender: "Banco X" });

      const result = await parseFinancingFromDocument(Buffer.from("bytes"), "image/jpeg");

      expect(result).toEqual({ lender: "Banco X" });
      expect(extractPdfTextMock).not.toHaveBeenCalled();
      expect(extractStructuredMock).toHaveBeenCalledWith(
        "document-vision",
        { kind: "vision", bytes: expect.any(Buffer), mimeType: "image/jpeg" },
        expect.any(String),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it("senha errada/faltando (PdfPasswordError) retorna null, nunca lança", async () => {
      extractPdfTextMock.mockRejectedValueOnce(new FakePdfPasswordError("senha errada"));

      const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf", "senha-errada");

      expect(result).toBeNull();
      expect(extractStructuredMock).not.toHaveBeenCalled();
    });

    it("erro genérico de extractPdfText (PDF corrompido) retorna null, nunca lança", async () => {
      extractPdfTextMock.mockRejectedValueOnce(new Error("corrupted"));

      const result = await parseFinancingFromDocument(Buffer.from("bytes"), "application/pdf");

      expect(result).toBeNull();
    });
  });
  ```
  ```bash
  npx vitest run src/modules/telegram/financing-parser.test.ts
  ```
  Output esperado: falha — a assinatura atual de `parseFinancingFromDocument` não aceita
  `password`, e não chama `extractPdfText`/`extractStructured` ainda.

- [ ] **13.2 — Reescrever `financing-parser.ts`.** Substitui o import de `callGemini`
  (não usado mais — `ai-parser.ts` continua com o `callGemini` original pros outros
  caminhos do Telegram, nada muda lá) pelos novos:
  ```ts
  import { z } from "zod";
  import type { ParsedFinancing } from "./types";
  import { extractPdfText, PdfPasswordError } from "@/lib/pdf/extract-text";
  import { extractStructured } from "@/lib/ai/extract";
  import type { JsonSchema } from "@/lib/ai/types";
  ```
  `parsedFinancingSchema`, `decimalStringSchema`, `isoDateSchema`,
  `parsedFinancingInstallmentSchema`, `parseFinancingResponse` continuam EXATAMENTE como
  estavam (não mudam — validação de saída é a mesma, independente do provider).

  `FINANCING_RESPONSE_SCHEMA` troca do formato Gemini/OpenAPI (uppercase) pro JSON Schema
  padrão (lowercase — mesmo formato usado por `card-invoice-parser.ts`, os adapters
  convertem internamente quando precisam, ver `gemini.ts` `toGeminiSchema`):
  ```ts
  const FINANCING_RESPONSE_SCHEMA: JsonSchema = {
    type: "object",
    properties: {
      description: { type: "string", nullable: true },
      lender: { type: "string", nullable: true },
      operationRef: { type: "string", nullable: true },
      principal: { type: "string", nullable: true },
      downPayment: { type: "string", nullable: true },
      assetValue: { type: "string", nullable: true },
      assetDescription: { type: "string", nullable: true },
      installmentsCount: { type: "integer", nullable: true },
      installmentAmount: { type: "string", nullable: true },
      totalToPay: { type: "string", nullable: true },
      firstDueDate: { type: "string", nullable: true },
      interestRate: { type: "string", nullable: true },
      interestPeriod: { type: "string", enum: INTEREST_PERIOD_VALUES, nullable: true },
      cet: { type: "string", nullable: true },
      amortizationSystem: { type: "string", enum: AMORTIZATION_SYSTEM_VALUES, nullable: true },
      financedTaxes: { type: "string", nullable: true },
      financedInsurance: { type: "string", nullable: true },
      financedFees: { type: "string", nullable: true },
      installments: {
        type: "array",
        nullable: true,
        items: {
          type: "object",
          properties: { amount: { type: "string" }, dueDate: { type: "string" } },
          required: ["amount", "dueDate"],
        },
      },
    },
  };
  ```
  `buildFinancingPrompt()` continua idêntica (não muda — o texto do prompt já é
  provider-agnóstico, não fala de Gemini nem NVIDIA).

  Função nova, substitui o corpo de `parseFinancingFromDocument` (mesma assinatura +
  `password?` novo, mesmo tipo de retorno `ParsedFinancing | null`):
  ```ts
  /**
   * Extração via camada de IA (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Fluxo 2") — PDF com text layer usa `role: "document-text"` (deepseek, `thinking:false`),
   * o MESMO role usado pra fatura de cartão (`card-invoice-parser.ts`) — thinking/reasoning
   * OFF por padrão vale pra TODO documento, contrato incluso (decisão explícita do dono:
   * ligar reasoning só por medição concreta, nunca por suposição de que um documento
   * "parece complexo" — ver nota condicional no final do arquivo/plano, T13, sobre trocar
   * pra `role: "document-text-reasoning"` SE os testes reais mostrarem confusão de campo).
   * PDF escaneado (sem text layer) ou foto direta (mimeType não-PDF) usa
   * `role: "document-vision"` (qwen) — mesmo caminho de `card-invoice-parser.ts`.
   *
   * `password` só se aplica a PDF (CCB escaneado como foto não tem senha). Senha
   * errada/faltando (`PdfPasswordError`) e qualquer outra falha de leitura do PDF viram
   * `null` — MESMO contrato de sempre (`callGemini` também sempre devolvia `null` em
   * qualquer falha), o chamador (`modules/loans`, fora deste parser) já trata `null` como
   * "peça pro usuário preencher manualmente".
   */
  export async function parseFinancingFromDocument(
    documentBytes: Buffer,
    mimeType: string,
    password?: string,
  ): Promise<ParsedFinancing | null> {
    const prompt = buildFinancingPrompt();

    if (mimeType !== "application/pdf") {
      return extractStructured(
        "document-vision",
        { kind: "vision", bytes: documentBytes, mimeType },
        prompt,
        FINANCING_RESPONSE_SCHEMA,
        parseFinancingResponse,
      );
    }

    let extraction: { text: string; hasTextLayer: boolean };
    try {
      extraction = await extractPdfText(documentBytes, password);
    } catch (error) {
      if (error instanceof PdfPasswordError) return null;
      console.error("[modules/telegram/financing-parser] extractPdfText failed", {
        reason: error instanceof Error ? error.name : "unknown",
      });
      return null;
    }

    if (extraction.hasTextLayer) {
      return extractStructured(
        "document-text",
        { kind: "text", text: extraction.text },
        prompt,
        FINANCING_RESPONSE_SCHEMA,
        parseFinancingResponse,
      );
    }

    return extractStructured(
      "document-vision",
      { kind: "vision", bytes: documentBytes, mimeType },
      prompt,
      FINANCING_RESPONSE_SCHEMA,
      parseFinancingResponse,
    );
  }
  ```

- [ ] **13.3 — Rodar e ver passar.**
  ```bash
  npx vitest run src/modules/telegram/financing-parser.test.ts
  ```
  Output esperado: `5 passed`.

- [ ] **13.4 — `tsc` — deve sobrar erro só em
  `src/app/(app)/financings/actions.ts`/`financing-import-button.tsx` (T14/T17).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```

- [ ] **13.5 — Regressão: suíte inteira + commit.**
  ```bash
  npx vitest run
  git add src/modules/telegram/financing-parser.ts src/modules/telegram/financing-parser.test.ts
  git commit -m "feat(telegram): financing-parser usa a camada de IA nova (NVIDIA + extractPdfText)"
  ```

**13.6 — Nota condicional (NÃO é um passo a executar por padrão — só documentar o
gatilho de upgrade).** `role: "document-text-reasoning"` (nemotron + `reasoning_budget`,
já configurado no registry desde T4) existe especificamente pra este documento, mas
**não é ligado automaticamente por nenhum código deste plano**. Só trocar
`"document-text"` → `"document-text-reasoning"` na chamada de 13.2 (linha `extractStructured("document-text", ...)`
dentro do `if (extraction.hasTextLayer)`) SE, depois de rodar `parseFinancingFromDocument`
contra pelo menos 1 contrato real (quando o dono tiver um disponível — ver gap já
reportado em "Pontos do spec que não couberam 1:1 numa tarefa"), a medição mostrar
`principal`/`assetValue`/`downPayment` (ou qualquer outro campo) sistematicamente
trocados/errados. Esse ajuste, se necessário, é um diff de 1 linha + reteste — não requer
mexer no registry (`models.ts`) nem em nenhum outro arquivo.

---

### T14 — `parseFinancingDocumentAction` aceita `password?`

**Files:**
- Modify: `src/app/(app)/financings/actions.ts`

**Interfaces:**
- Produces (assinatura nova): `parseFinancingDocumentAction(base64: string, mimeType: string, password?: string): Promise<ActionResult<ParsedFinancing>>`

Sem teste novo — mesmo padrão de zero-teste-de-action já usado no resto do plano (T12);
a lógica nova (`password` passa direto pro parser) já está coberta pelos testes de T13.

Passos:

- [ ] **14.1 — Editar `src/app/(app)/financings/actions.ts`.**
  ```ts
  export async function parseFinancingDocumentAction(
    base64: string,
    mimeType: string,
    password?: string,
  ): Promise<ActionResult<ParsedFinancing>> {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: { code: "UNAUTHENTICATED", message: "Sessão inválida." } };
    }

    if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
      return {
        success: false,
        error: { code: "UNSUPPORTED_MIME_TYPE", message: "Formato não suportado — envie PDF, JPEG, PNG ou WebP." },
      };
    }

    const documentBytes = Buffer.from(base64, "base64");
    const parsed = await parseFinancingFromDocument(documentBytes, mimeType, password);

    if (!parsed) {
      return {
        success: false,
        error: { code: "DOCUMENT_UNREADABLE", message: "Não consegui ler o documento — confira a senha (se houver) ou preencha os campos manualmente." },
      };
    }

    return { success: true, data: parsed };
  }
  ```
  (Só a assinatura + a mensagem de erro mudaram — resto do arquivo intocado.)

- [ ] **14.2 — `tsc` limpo.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: erro restante só em `financing-import-button.tsx` (ainda chama a action com 2
  argumentos — resolvido em T17).

- [ ] **14.3 — Commit.**
  ```bash
  git add "src/app/(app)/financings/actions.ts"
  git commit -m "feat(financings): parseFinancingDocumentAction aceita senha do PDF"
  ```

---

## Fase 4 — Frontend

Nota de escopo: o projeto NÃO tem nenhum teste de componente React hoje (`vitest.config.ts`
só inclui `src/**/*.test.ts`, sem `.tsx` — os 3 arquivos de teste existentes são todos de
lógica pura em `modules/telegram/`). T15-T17 seguem esse padrão estabelecido: sem arquivo
de teste novo, verificação por `tsc --noEmit` + `npm run build` + QA manual (checklist no
final de cada tarefa). Introduzir teste de componente agora seria um padrão novo não
pedido pelo spec — se quiser isso como follow-up, é uma sugestão de melhoria separada, não
parte deste plano.

### T15 — `PasswordProtectedFileField` (componente compartilhado)

**Files:**
- Create: `src/components/imports/password-protected-file-field.tsx`

**Interfaces:**
- Produces: `PasswordProtectedFileField(props: StandaloneProps | EmbeddedProps)`

Decisão de design (resolve uma tensão do spec — documentar aqui): o spec descreve o
componente como "input de arquivo + toggle 'tem senha?' + campo de senha condicional",
mas os 2 lugares que o usam têm necessidades diferentes: `financing-import-button.tsx`
(T17) troca INTEIRO o próprio `<input type=file>` por este componente (1 arquivo por
vez); `card-import-button.tsx`/dropzone (T16) já tem seleção multi-arquivo própria
(`ImportDropzone`) — ali o componente só precisa complementar CADA linha já adicionada
com o toggle+senha, sem um 2º `<input type=file>` por arquivo. Resolvido com uma prop
`mode`: `"standalone"` (default, renderiza o próprio input — T17) e `"embedded"` (sem
input, só toggle+senha — T16, dentro de `ImportFileRow`). Mantém DRY (mesmo bloco
toggle+senha nos 2 casos, extraído desde o início por já ter 2 consumidores concretos
conhecidos — ~/.claude/rules/02-dry-kiss-yagni.md) sem forçar uma UI que não faz sentido
no dropzone multi-arquivo.

Passos:

- [ ] **15.1 — Ler um componente de form existente pra confirmar o padrão de
  Label/Switch/Input do design system** (já lido durante o planejamento —
  `src/components/loans/loan-interest-fields.tsx` usa `Switch` com `checked`/
  `onCheckedChange`, `Label htmlFor`; `financing-import-button.tsx` usa `Input type=file`
  dentro de `<div className="flex flex-col gap-1.5 rounded-[10px] border border-dashed border-border p-3">`
  — reproduzir a mesma classe/estrutura pro modo `standalone`).

- [ ] **15.2 — Criar o componente.**
  ```bash
  mkdir -p /Users/carloshenrique/Documents/PESSOAL/personal-finance/src/components/imports
  ```
  ```tsx
  // src/components/imports/password-protected-file-field.tsx
  "use client";

  import { type ChangeEvent } from "react";
  import { Loader2 } from "lucide-react";

  import { Input } from "@/components/ui/input";
  import { Label } from "@/components/ui/label";
  import { Switch } from "@/components/ui/switch";

  type PasswordProtectedFileFieldBaseProps = {
    idPrefix: string;
    hasPassword: boolean;
    onHasPasswordChange: (hasPassword: boolean) => void;
    password: string;
    onPasswordChange: (password: string) => void;
    disabled?: boolean;
  };

  type StandaloneProps = PasswordProtectedFileFieldBaseProps & {
    mode?: "standalone";
    label: string;
    helperText?: string;
    accept: string;
    onFileSelect: (file: File) => void;
    loading?: boolean;
    loadingLabel?: string;
    /** Remonta o `<input>` depois de um upload (mesmo truque de `financing-import-button.tsx` atual) — permite reimportar o MESMO arquivo. */
    inputKey: number;
  };

  type EmbeddedProps = PasswordProtectedFileFieldBaseProps & { mode: "embedded" };

  type PasswordProtectedFileFieldProps = StandaloneProps | EmbeddedProps;

  /**
   * Componente compartilhado "arquivo + senha" (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Frontend" — usado nos 2 fluxos de import por IA). Ver decisão de design no plano de
   * origem (docs/superpowers/plans/2026-07-11-import-documentos-nvidia.md, T15) sobre os 2
   * modos: `"standalone"` (default) tem o próprio `<input type=file>` — 1 arquivo por vez,
   * usado por `financing-import-button.tsx`; `"embedded"` é só o toggle+campo de senha,
   * embutido numa linha já existente do dropzone multi-arquivo (`card-import-button.tsx`
   * via `ImportFileRow`).
   */
  export function PasswordProtectedFileField(props: PasswordProtectedFileFieldProps) {
    const { idPrefix, hasPassword, onHasPasswordChange, password, onPasswordChange, disabled } = props;

    const toggle = (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={`${idPrefix}-has-password`} className="text-[12.5px] font-medium text-muted-foreground">
          Este arquivo tem senha?
        </Label>
        <Switch
          id={`${idPrefix}-has-password`}
          size="sm"
          checked={hasPassword}
          onCheckedChange={onHasPasswordChange}
          disabled={disabled}
        />
      </div>
    );

    const passwordField = hasPassword && (
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-password`} className="sr-only">
          Senha do arquivo
        </Label>
        <Input
          id={`${idPrefix}-password`}
          type="password"
          placeholder="Senha do arquivo"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          disabled={disabled}
          autoComplete="off"
        />
      </div>
    );

    if (props.mode === "embedded") {
      return (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
          {toggle}
          {passwordField}
        </div>
      );
    }

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0];
      if (file) props.onFileSelect(file);
    }

    return (
      <div className="flex flex-col gap-2 rounded-[10px] border border-dashed border-border p-3">
        <Label htmlFor={`${idPrefix}-file`} className="text-[12.5px]">
          {props.label}
        </Label>
        <Input
          key={props.inputKey}
          id={`${idPrefix}-file`}
          type="file"
          accept={props.accept}
          onChange={handleChange}
          disabled={disabled || props.loading}
        />
        {toggle}
        {passwordField}
        {props.loading && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {props.loadingLabel ?? "Processando…"}
          </p>
        )}
        {props.helperText && <p className="text-[11.5px] font-medium text-muted-foreground">{props.helperText}</p>}
      </div>
    );
  }
  ```

- [ ] **15.3 — `tsc` limpo (componente ainda sem consumidor — só valida que compila
  isolado).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```

- [ ] **15.4 — Commit.**
  ```bash
  git add src/components/imports/password-protected-file-field.tsx
  git commit -m "feat(imports): PasswordProtectedFileField compartilhado (fatura + contrato)"
  ```

---

### T16 — Botão "Importar fatura" no cartão (dropzone generalizado por `target`)

**Files:**
- Move (`git mv`) + Modify: `src/components/accounts/import-types.ts` → `src/components/imports/import-types.ts`
- Move (`git mv`) + Modify: `src/components/accounts/use-import-files.ts` → `src/components/imports/use-import-files.ts`
- Move (`git mv`) + Modify: `src/components/accounts/import-file-utils.ts` → `src/components/imports/import-file-utils.ts`
- Move (`git mv`) + Modify: `src/components/accounts/import-file-row.tsx` → `src/components/imports/import-file-row.tsx`
- Move (`git mv`) + Modify: `src/components/accounts/import-dropzone.tsx` → `src/components/imports/import-dropzone.tsx`
- Move (`git mv`) + Modify: `src/components/accounts/import-modal.tsx` → `src/components/imports/import-modal.tsx`
- Move (`git mv`, sem mudança de conteúdo): `src/components/accounts/import-preview.tsx`, `import-preview-panel.tsx`, `import-result.tsx`, `import-stepper.tsx`, `import-motion.ts` → `src/components/imports/`
- Modify: `src/components/accounts/import-button.tsx` (aponta pro `ImportModal` novo local + `target`)
- Modify: `src/components/accounts/account-header-actions.tsx` (import path, sem mudança de comportamento)
- Modify: `src/components/accounts/account-flow-summary.tsx` (import path de `PF_EASE_OUT`)
- Create: `src/components/cards/card-import-button.tsx`
- Modify: `src/components/cards/card-detail-view.tsx` (adiciona o botão no header)

**Interfaces:**
- Produces (assinatura nova): `useImportFiles(target: ImportTarget)` (era `useImportFiles(accountId: string)`)
- Produces (campo novo): `ImportFileEntry.hasPassword: boolean`, `ImportFileEntry.password: string`
- Produces: `ImportModal({ open, onOpenChange, target }: { target: ImportTarget })` (era `{ accountId }`)
- Produces: `CardImportButton({ cardId }: { cardId: string })`

Passos:

- [ ] **16.1 — Mover os 10 arquivos genéricos pra `components/imports/` (`git mv`
  preserva histórico).**
  ```bash
  cd /Users/carloshenrique/Documents/PESSOAL/personal-finance
  mkdir -p src/components/imports
  git mv src/components/accounts/import-types.ts src/components/imports/import-types.ts
  git mv src/components/accounts/use-import-files.ts src/components/imports/use-import-files.ts
  git mv src/components/accounts/import-file-utils.ts src/components/imports/import-file-utils.ts
  git mv src/components/accounts/import-file-row.tsx src/components/imports/import-file-row.tsx
  git mv src/components/accounts/import-dropzone.tsx src/components/imports/import-dropzone.tsx
  git mv src/components/accounts/import-modal.tsx src/components/imports/import-modal.tsx
  git mv src/components/accounts/import-preview.tsx src/components/imports/import-preview.tsx
  git mv src/components/accounts/import-preview-panel.tsx src/components/imports/import-preview-panel.tsx
  git mv src/components/accounts/import-result.tsx src/components/imports/import-result.tsx
  git mv src/components/accounts/import-stepper.tsx src/components/imports/import-stepper.tsx
  git mv src/components/accounts/import-motion.ts src/components/imports/import-motion.ts
  ```
  `import-preview.tsx`/`import-preview-panel.tsx`/`import-result.tsx`/`import-stepper.tsx`/
  `import-motion.ts` só têm imports relativos entre si (confirmado durante o
  planejamento) — o `git mv` em grupo já deixa esses 5 arquivos funcionando sem editar
  1 linha de conteúdo.

- [ ] **16.2 — `tsc` pra ver TODOS os imports quebrados de uma vez** (esperado — vamos
  corrigir nos próximos passos):
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: erros em `src/components/accounts/import-button.tsx`,
  `account-header-actions.tsx`, `account-flow-summary.tsx`, e dentro dos próprios
  arquivos movidos (`import-types.ts`/`use-import-files.ts`/`import-file-utils.ts` ainda
  falam de `accountId`, corrigidos nos passos 16.3-16.5).

- [ ] **16.3 — Generalizar `import-types.ts` (adiciona `hasPassword`/`password`).**
  ```ts
  // src/components/imports/import-types.ts
  import type { ImportPreview, ImportCommitResult, ParsedTransaction } from "@/modules/imports/types";

  export type ImportFileReadStatus = "reading" | "ready" | "error";

  /**
   * Estado de UM arquivo dentro do dropzone multi-arquivo (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Frontend") — generalizado por `target` (`ImportModal`/`useImportFiles`, não por
   * arquivo). `hasPassword`/`password`: só relevante pra target CARTÃO + arquivo PDF
   * (fatura cifrada) — conta nunca usa (`ImportDropzone allowPassword={target.kind==="card"}`).
   */
  export type ImportFileEntry = {
    id: string;
    file: File;
    name: string;
    size: number;
    status: ImportFileReadStatus;
    content: string | null;
    error: string | null;
    hasPassword: boolean;
    password: string;
    preview: ImportPreview | null;
    parsed: ParsedTransaction[] | null;
    previewError: string | null;
    commit: ImportCommitResult | null;
    commitError: string | null;
  };

  export type ImportStep = "select" | "preview" | "result";
  ```

- [ ] **16.4 — Generalizar `import-file-utils.ts` (`buildFileEntry` inicializa
  `hasPassword`/`password`).** Editar só a função `buildFileEntry` (resto do arquivo
  intocado):
  ```ts
  export function buildFileEntry(file: File): ImportFileEntry {
    const supported = isSupportedImportFile(file.name);

    return {
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      status: supported ? "reading" : "error",
      content: null,
      error: supported ? null : "Formato não suportado — use OFX, CSV, XLS, XLSX ou PDF.",
      hasPassword: false,
      password: "",
      preview: null,
      parsed: null,
      previewError: null,
      commit: null,
      commitError: null,
    };
  }
  ```

- [ ] **16.5 — Generalizar `use-import-files.ts` (`accountId` → `target`, + `setPassword`).**
  ```ts
  // src/components/imports/use-import-files.ts
  "use client";

  import { useState } from "react";

  import { previewImportAction, commitImportAction } from "@/modules/imports/actions";
  import type { ImportTarget } from "@/modules/imports/types";
  import { buildFileEntry, readEntryContent } from "./import-file-utils";
  import type { ImportFileEntry, ImportStep } from "./import-types";

  type EntryPatch = Partial<ImportFileEntry> & { id: string };

  function applyPatches(entries: ImportFileEntry[], patches: EntryPatch[]): ImportFileEntry[] {
    const byId = new Map(patches.map((patch) => [patch.id, patch]));
    return entries.map((entry) => (byId.has(entry.id) ? { ...entry, ...byId.get(entry.id) } : entry));
  }

  /**
   * Estado do importador multi-arquivo — generalizado por `target` (conta OU cartão,
   * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 1").
   * Front itera as Server Actions por arquivo — 1 `previewImportAction` + 1
   * `commitImportAction` cada, sem action batch nova.
   */
  export function useImportFiles(target: ImportTarget) {
    const [step, setStep] = useState<ImportStep>("select");
    const [entries, setEntries] = useState<ImportFileEntry[]>([]);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    async function addFiles(incoming: FileList | File[]) {
      const existingKeys = new Set(entries.map((entry) => `${entry.name}-${entry.size}`));
      const additions = Array.from(incoming)
        .filter((file) => !existingKeys.has(`${file.name}-${file.size}`))
        .map(buildFileEntry);
      if (additions.length === 0) return;

      setEntries((current) => [...current, ...additions]);

      const readable = additions.filter((entry) => entry.status === "reading");
      if (readable.length === 0) return;

      const patches = await Promise.all(
        readable.map(async (entry): Promise<EntryPatch> => {
          try {
            const content = await readEntryContent(entry.file);
            return { id: entry.id, status: "ready", content, error: null };
          } catch {
            return { id: entry.id, status: "error", content: null, error: "Não foi possível ler o arquivo." };
          }
        }),
      );

      setEntries((current) => applyPatches(current, patches));
    }

    function removeFile(id: string) {
      setEntries((current) => current.filter((entry) => entry.id !== id));
    }

    /** Atualiza `hasPassword`/`password` de UM arquivo — chamado pelo `PasswordProtectedFileField` embutido em `ImportFileRow` (`ImportDropzone`, só quando `target.kind==="card"`). */
    function setPassword(id: string, hasPassword: boolean, password: string) {
      setEntries((current) => applyPatches(current, [{ id, hasPassword, password }]));
    }

    async function analyze(): Promise<ImportFileEntry[]> {
      const ready = entries.filter((entry) => entry.status === "ready");
      if (ready.length === 0) return entries;

      setIsAnalyzing(true);
      const patches = await Promise.all(
        ready.map(async (entry): Promise<EntryPatch> => {
          try {
            const password = entry.hasPassword && entry.password ? entry.password : undefined;
            const response = await previewImportAction(target, entry.name, entry.content!, password);
            return response.success
              ? { id: entry.id, preview: response.data.preview, parsed: response.data.transactions, previewError: null }
              : { id: entry.id, preview: null, parsed: null, previewError: response.error.message };
          } catch {
            return { id: entry.id, preview: null, previewError: "Não foi possível analisar o arquivo." };
          }
        }),
      );

      const nextEntries = applyPatches(entries, patches);
      setEntries(nextEntries);
      setIsAnalyzing(false);
      setStep("preview");
      return nextEntries;
    }

    async function confirm(): Promise<ImportFileEntry[]> {
      const analyzed = entries.filter((entry) => entry.preview !== null && entry.parsed !== null);
      if (analyzed.length === 0) return entries;

      setIsConfirming(true);
      const patches = await Promise.all(
        analyzed.map(async (entry): Promise<EntryPatch> => {
          try {
            const response = await commitImportAction(target, entry.parsed!, entry.preview!.erros);
            return response.success
              ? { id: entry.id, commit: response.data, commitError: null }
              : { id: entry.id, commit: null, commitError: response.error.message };
          } catch {
            return { id: entry.id, commit: null, commitError: "Não foi possível confirmar a importação." };
          }
        }),
      );

      const nextEntries = applyPatches(entries, patches);
      setEntries(nextEntries);
      setIsConfirming(false);
      setStep("result");
      return nextEntries;
    }

    function back() {
      setStep("select");
    }

    function reset() {
      setStep("select");
      setEntries([]);
      setIsAnalyzing(false);
      setIsConfirming(false);
    }

    return { step, entries, isAnalyzing, isConfirming, addFiles, removeFile, setPassword, analyze, confirm, back, reset };
  }
  ```

- [ ] **16.6 — `ImportFileRow` ganha o campo de senha embutido (`mode="embedded"`).**
  ```tsx
  // src/components/imports/import-file-row.tsx
  "use client";

  import { motion } from "framer-motion";
  import { CheckCircle2, FileSpreadsheet, FileText, Loader2, X, XCircle } from "lucide-react";

  import { IconActionButton } from "@/components/shared/icon-action-button";
  import { cn } from "@/lib/utils";
  import { PasswordProtectedFileField } from "./password-protected-file-field";
  import { formatFileSize } from "./import-file-utils";
  import { listItemVariants } from "./import-motion";
  import type { ImportFileEntry } from "./import-types";

  type ImportFileRowProps = {
    entry: ImportFileEntry;
    onRemove: () => void;
    disabled?: boolean;
    /** Fatura de cartão costuma vir cifrada (CPF/data de nascimento); extrato de conta, na prática, nunca — campo de senha só aparece quando faz sentido pro target (`ImportDropzone allowPassword`). */
    allowPassword?: boolean;
    onPasswordChange?: (hasPassword: boolean, password: string) => void;
  };

  const STATUS_LABEL: Record<ImportFileEntry["status"], string> = {
    reading: "Lendo…",
    ready: "Pronto",
    error: "Erro",
  };

  function getFileTypeVisual(name: string) {
    const lower = name.toLowerCase();
    if (lower.endsWith(".pdf")) return { Icon: FileText, tile: "bg-destructive/16 text-on-danger" };
    if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
      return { Icon: FileSpreadsheet, tile: "bg-secondary text-muted-foreground" };
    }
    return { Icon: FileText, tile: "bg-secondary text-muted-foreground" };
  }

  function StatusIndicator({ status }: { status: ImportFileEntry["status"] }) {
    if (status === "reading") return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
    if (status === "ready") return <CheckCircle2 className="size-3.5 text-on-success" aria-hidden="true" />;
    return <XCircle className="size-3.5 text-on-danger" aria-hidden="true" />;
  }

  export function ImportFileRow({ entry, onRemove, disabled, allowPassword, onPasswordChange }: ImportFileRowProps) {
    const { Icon, tile } = getFileTypeVisual(entry.name);
    const statusText = entry.status === "error" ? entry.error : STATUS_LABEL[entry.status];
    const showPasswordField = Boolean(allowPassword) && entry.name.toLowerCase().endsWith(".pdf") && entry.status !== "error";

    return (
      <motion.li variants={listItemVariants} exit="exit" className="flex flex-col border-b border-border last:border-b-0">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tile)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{entry.name}</p>
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" aria-live="polite">
              <span>{formatFileSize(entry.size)}</span>
              <span aria-hidden="true">·</span>
              <StatusIndicator status={entry.status} />
              <span className="truncate">{statusText}</span>
            </p>
          </div>

          <IconActionButton icon={X} tone="danger" label="Remover arquivo" onClick={onRemove} disabled={disabled} />
        </div>

        {showPasswordField && onPasswordChange && (
          <PasswordProtectedFileField
            mode="embedded"
            idPrefix={`import-file-${entry.id}`}
            hasPassword={entry.hasPassword}
            onHasPasswordChange={(hasPassword) => onPasswordChange(hasPassword, entry.password)}
            password={entry.password}
            onPasswordChange={(password) => onPasswordChange(entry.hasPassword, password)}
            disabled={disabled}
          />
        )}
      </motion.li>
    );
  }
  ```

- [ ] **16.7 — `ImportDropzone` repassa `allowPassword`/`onPasswordChange`.** Editar só
  o tipo de props e o `<ImportFileRow>` dentro do `.map` em
  `src/components/imports/import-dropzone.tsx`:
  ```ts
  type ImportDropzoneProps = {
    entries: ImportFileEntry[];
    onAddFiles: (files: FileList | File[]) => void;
    onRemoveFile: (id: string) => void;
    disabled?: boolean;
    allowPassword?: boolean;
    onPasswordChange?: (id: string, hasPassword: boolean, password: string) => void;
  };
  ```
  ```tsx
  {entries.map((entry) => (
    <ImportFileRow
      key={entry.id}
      entry={entry}
      onRemove={() => onRemoveFile(entry.id)}
      disabled={disabled}
      allowPassword={allowPassword}
      onPasswordChange={onPasswordChange ? (hasPassword, password) => onPasswordChange(entry.id, hasPassword, password) : undefined}
    />
  ))}
  ```
  (Resto do arquivo — `openFilePicker`, drag&drop, `<input>` — intocado.)

- [ ] **16.8 — `ImportModal` generalizado por `target` (título/descrição/mensagem por
  `target.kind`).**
  ```tsx
  // src/components/imports/import-modal.tsx
  "use client";

  import { useRouter } from "next/navigation";
  import { useQueryClient } from "@tanstack/react-query";
  import { AnimatePresence, motion, MotionConfig } from "framer-motion";
  import { Loader2 } from "lucide-react";

  import { FormModal } from "@/components/shared/form-modal";
  import { Button } from "@/components/ui/button";
  import { invalidateAllTransactionLists } from "@/components/transactions/transaction-query-keys";
  import { notifySuccess } from "@/lib/toast";
  import type { ImportTarget } from "@/modules/imports/types";
  import { ACCOUNT_PERIOD_SUMMARY_QUERY_KEY } from "@/components/accounts/use-account-period-summary";
  import { aggregateCommit, isPdfImportFile } from "./import-file-utils";
  import { ImportDropzone } from "./import-dropzone";
  import { STEP_TRANSITION, stepVariants } from "./import-motion";
  import { ImportPreview } from "./import-preview";
  import { ImportResult } from "./import-result";
  import { ImportStepper } from "./import-stepper";
  import { useImportFiles } from "./use-import-files";

  type ImportModalProps = { open: boolean; onOpenChange: (open: boolean) => void; target: ImportTarget };

  const COPY: Record<ImportTarget["kind"], { title: string; description: string; extractingLabel: string; successMessage: string }> = {
    account: {
      title: "Importar extrato",
      description: "Arraste um ou mais extratos (OFX, CSV, XLS, XLSX ou PDF), confira a prévia agregada e só grava depois de confirmar.",
      extractingLabel: "Extraindo lançamentos do PDF com IA (pode levar alguns segundos)…",
      successMessage: "Extrato importado",
    },
    card: {
      title: "Importar fatura",
      description: "Arraste uma ou mais faturas em PDF (inclusive com senha), confira a prévia agregada e só grava depois de confirmar.",
      extractingLabel: "Extraindo lançamentos da fatura com IA (pode levar até 1-2 minutos)…",
      successMessage: "Fatura importada",
    },
  };

  /**
   * Importador multi-arquivo generalizado por `target` (conta OU cartão,
   * docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Frontend").
   * 3 passos dentro do MESMO modal (docs/05-UX_RULES.md, "Modais"). Reimportar é seguro —
   * dedup no backend (por `fitId` ou fallback `(data,valor[,descrição])`, ver
   * `modules/imports/service.ts`).
   */
  export function ImportModal({ open, onOpenChange, target }: ImportModalProps) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const { step, entries, isAnalyzing, isConfirming, addFiles, removeFile, setPassword, analyze, confirm, back, reset } =
      useImportFiles(target);
    const copy = COPY[target.kind];

    function handleOpenChange(next: boolean) {
      if (!next) reset();
      onOpenChange(next);
    }

    function handleClose() {
      handleOpenChange(false);
    }

    async function handleConfirm() {
      const nextEntries = await confirm();
      const totals = aggregateCommit(nextEntries);

      invalidateAllTransactionLists(queryClient);
      if (target.kind === "account") {
        void queryClient.invalidateQueries({ queryKey: [ACCOUNT_PERIOD_SUMMARY_QUERY_KEY] });
      }
      router.refresh();
      if (totals.imported > 0 || totals.duplicados > 0) notifySuccess(copy.successMessage);
    }

    const hasReadyFiles = entries.some((entry) => entry.status === "ready");
    const isReadingAny = entries.some((entry) => entry.status === "reading");
    const totalNovos = entries.reduce((sum, entry) => sum + (entry.preview?.novos.length ?? 0), 0);
    const isAnalyzingPdf = isAnalyzing && entries.some((entry) => entry.status === "ready" && isPdfImportFile(entry.name));

    return (
      <FormModal open={open} onOpenChange={handleOpenChange} title={copy.title} description={copy.description} size="wide">
        <MotionConfig reducedMotion="user">
          <div className="flex flex-col gap-4">
            <ImportStepper step={step} />

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={step} variants={stepVariants} initial="enter" animate="center" exit="exit" transition={STEP_TRANSITION}>
                {step === "select" && (
                  <ImportDropzone
                    entries={entries}
                    onAddFiles={addFiles}
                    onRemoveFile={removeFile}
                    disabled={isAnalyzing}
                    allowPassword={target.kind === "card"}
                    onPasswordChange={setPassword}
                  />
                )}
                {step === "preview" && <ImportPreview entries={entries} />}
                {step === "result" && <ImportResult entries={entries} />}
              </motion.div>
            </AnimatePresence>

            {isAnalyzingPdf && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                {copy.extractingLabel}
              </p>
            )}

            <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t border-border bg-muted/50 p-4 sm:flex-row sm:justify-end">
              {step !== "result" && (
                <Button type="button" variant="outline" onClick={handleClose} disabled={isAnalyzing || isConfirming}>
                  Cancelar
                </Button>
              )}
              {step === "select" && (
                <Button type="button" onClick={() => void analyze()} disabled={!hasReadyFiles || isReadingAny || isAnalyzing}>
                  {isAnalyzing && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Analisar arquivos
                </Button>
              )}
              {step === "preview" && (
                <Button type="button" variant="outline" onClick={back} disabled={isConfirming}>
                  Voltar
                </Button>
              )}
              {step === "preview" && (
                <Button type="button" onClick={() => void handleConfirm()} disabled={isConfirming || totalNovos === 0}>
                  {isConfirming && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  Confirmar importação
                </Button>
              )}
              {step === "result" && (
                <Button type="button" onClick={handleClose}>
                  Concluir
                </Button>
              )}
            </div>
          </div>
        </MotionConfig>
      </FormModal>
    );
  }
  ```

- [ ] **16.9 — Atualizar os 3 consumidores que ficaram em `components/accounts/`.**

  `src/components/accounts/import-button.tsx`:
  ```tsx
  "use client";

  import { useState } from "react";
  import { UploadCloud } from "lucide-react";

  import { Button } from "@/components/ui/button";
  import { ImportModal } from "@/components/imports/import-modal";

  type ImportButtonProps = { accountId: string };

  export function ImportButton({ accountId }: ImportButtonProps) {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button type="button" variant="accent" size="lg" className="gap-2" onClick={() => setOpen(true)}>
          <UploadCloud className="size-4" aria-hidden="true" />
          Importar extrato
        </Button>
        <ImportModal open={open} onOpenChange={setOpen} target={{ kind: "account", accountId }} />
      </>
    );
  }
  ```

  `src/components/accounts/account-header-actions.tsx`: SEM MUDANÇA de conteúdo — já
  importava `./import-button`, que continua no mesmo lugar. Só confirmar que `tsc` não
  reclama mais dele.

  `src/components/accounts/account-flow-summary.tsx`: trocar
  `import { PF_EASE_OUT } from "./import-motion";` por
  `import { PF_EASE_OUT } from "@/components/imports/import-motion";` (única linha).

- [ ] **16.10 — `CardImportButton` novo.** Criar
  `src/components/cards/card-import-button.tsx`:
  ```tsx
  "use client";

  import { useState } from "react";
  import { UploadCloud } from "lucide-react";

  import { Button } from "@/components/ui/button";
  import { ImportModal } from "@/components/imports/import-modal";

  type CardImportButtonProps = { cardId: string };

  /** "Importar fatura" no detalhe do cartão (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md,
   * "Frontend") — espelha `accounts/import-button.tsx`, `target={kind:"card"}`. */
  export function CardImportButton({ cardId }: CardImportButtonProps) {
    const [open, setOpen] = useState(false);

    return (
      <>
        <Button type="button" variant="accent" size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
          <UploadCloud className="size-4" aria-hidden="true" />
          Importar fatura
        </Button>
        <ImportModal open={open} onOpenChange={setOpen} target={{ kind: "card", cardId }} />
      </>
    );
  }
  ```

- [ ] **16.11 — Wire no header de `card-detail-view.tsx`.** Import novo:
  ```ts
  import { CardImportButton } from "./card-import-button";
  ```
  E no bloco "Compras da fatura atual" (mesma linha do botão "Compra" existente),
  adicionar ao lado:
  ```tsx
  <div className="flex items-center justify-between gap-3">
    <h3 className="inline-flex items-center gap-2 text-base font-extrabold text-foreground">
      <ShoppingBag className="size-[17px] text-muted-foreground" aria-hidden="true" />
      Compras da fatura atual
    </h3>
    <div className="flex shrink-0 items-center gap-2">
      <CardImportButton cardId={card.id} />
      <Button
        type="button"
        variant="accent"
        size="sm"
        className="gap-1.5"
        onClick={() => openTransactionModal(TransactionType.EXPENSE, card.id)}
      >
        <Plus className="size-4" aria-hidden="true" />
        Compra
      </Button>
    </div>
  </div>
  ```

- [ ] **16.12 — `tsc` limpo (fecha TODO o frontend do Fluxo 1).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: zero erros.

- [ ] **16.13 — Suíte de testes + build + QA manual.**
  ```bash
  npx vitest run
  npm run build
  npm run dev
  ```
  Checklist manual (navegador):
  - `/accounts/[id]` → "Importar extrato" continua abrindo o modal, sem campo de senha
    visível em nenhum passo (target conta).
  - `/cards/[id]` → "Importar fatura" aparece no header de "Compras da fatura atual",
    abre o MESMO modal com título "Importar fatura".
  - Soltar um PDF no dropzone de cartão → linha do arquivo mostra o toggle "Este arquivo
    tem senha?" — ligar revela o campo de senha; desligar esconde.
  - Analisar com a fatura real (`Fatura.pdf`, senha `028574373`) → prévia mostra os
    lançamentos extraídos, sem duplicar nada num reimport.
  - Confirmar → lançamentos aparecem em "Compras da fatura atual" do cartão, `cardId` set.

- [ ] **16.14 — Commit.**
  ```bash
  git add -A src/components/imports src/components/accounts/import-button.tsx src/components/accounts/account-header-actions.tsx src/components/accounts/account-flow-summary.tsx src/components/cards/card-import-button.tsx src/components/cards/card-detail-view.tsx
  git commit -m "feat(cards): botão Importar fatura — dropzone generalizado por target (conta|cartão) + senha por arquivo"
  ```

---

### T17 — `FinancingImportButton` usa `PasswordProtectedFileField`

**Files:**
- Modify: `src/components/financings/financing-import-button.tsx`

**Interfaces:**
- Consumes: `PasswordProtectedFileField` (de `@/components/imports/password-protected-file-field`), `parseFinancingDocumentAction` (assinatura nova de T14)

Passos:

- [ ] **17.1 — Reescrever o componente** (troca o bloco `<Input type=file>` solto pelo
  `PasswordProtectedFileField` em modo `standalone`; resto do fluxo — `onParsed`,
  `notifyError`, `fileToBase64` — intocado):
  ```tsx
  "use client";

  import { useState } from "react";

  import { PasswordProtectedFileField } from "@/components/imports/password-protected-file-field";
  import { parseFinancingDocumentAction } from "@/app/(app)/financings/actions";
  import { notifyError } from "@/lib/toast";
  import type { ParsedFinancing } from "@/modules/telegram/types";

  const ACCEPTED_MIME_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

  type FinancingImportButtonProps = {
    onParsed: (parsed: ParsedFinancing) => void;
    disabled?: boolean;
  };

  async function fileToBase64(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary);
  }

  /**
   * "Importar de documento" — sobe PDF/foto do CCB/contrato de banco (inclusive PDF
   * cifrado, `PasswordProtectedFileField`), chama `parseFinancingDocumentAction`
   * (docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md, "Fluxo 2")
   * e devolve o `ParsedFinancing` pro `FinancingFormModal` pré-preencher via `onParsed`.
   * Sem passo de prévia separado: o próprio form de criação JÁ é a prévia.
   */
  export function FinancingImportButton({ onParsed, disabled }: FinancingImportButtonProps) {
    const [importing, setImporting] = useState(false);
    const [inputKey, setInputKey] = useState(0);
    const [hasPassword, setHasPassword] = useState(false);
    const [password, setPassword] = useState("");

    async function handleFileSelect(file: File) {
      setImporting(true);
      try {
        const base64 = await fileToBase64(file);
        const result = await parseFinancingDocumentAction(base64, file.type, hasPassword ? password : undefined);
        if (!result.success) {
          notifyError(result.error.message);
          return;
        }
        onParsed(result.data);
      } finally {
        setImporting(false);
        // Remonta o <input type="file"> — permite reimportar o MESMO arquivo.
        setInputKey((key) => key + 1);
      }
    }

    return (
      <PasswordProtectedFileField
        idPrefix="financing-import"
        mode="standalone"
        label="Importar de documento (opcional)"
        helperText="PDF ou foto do CCB/contrato do banco — os campos abaixo são pré-preenchidos automaticamente. Revise antes de salvar."
        accept={ACCEPTED_MIME_TYPES}
        onFileSelect={(file) => void handleFileSelect(file)}
        loading={importing}
        loadingLabel="Lendo e extraindo os dados do contrato…"
        inputKey={inputKey}
        hasPassword={hasPassword}
        onHasPasswordChange={setHasPassword}
        password={password}
        onPasswordChange={setPassword}
        disabled={disabled}
      />
    );
  }
  ```

- [ ] **17.2 — `tsc` limpo (fecha TODO o build do plano — última peça de frontend).**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Esperado: zero erros em todo o projeto.

- [ ] **17.3 — QA manual.**
  ```bash
  npm run dev
  ```
  - `/financings` → "Novo financiamento" → "Importar de documento" → toggle "Este arquivo
    tem senha?" aparece ANTES de escolher o arquivo (modo standalone) — ligar, escolher
    um PDF cifrado, confirmar que os campos do form vêm pré-preenchidos.
  - Sem tocar no toggle (documento sem senha) → fluxo igual ao de antes, sem regressão.

- [ ] **17.4 — Commit.**
  ```bash
  git add src/components/financings/financing-import-button.tsx
  git commit -m "feat(financings): FinancingImportButton usa PasswordProtectedFileField compartilhado"
  ```

---

## Fase 5 — Regressão

### T18 — Regressão completa + reminders de segurança

**Files:** nenhum arquivo novo — só verificação.

Passos:

- [ ] **18.1 — Suíte de testes inteira.**
  ```bash
  npx vitest run
  ```
  Output esperado: TODOS os testes passam — os 3 arquivos originais de
  `modules/telegram/` (`pending-merge.test.ts`, `parser.test.ts`, `resolve.test.ts`,
  intocados por este plano) + todos os testes novos das 18 tarefas acima. Zero
  regressão.

- [ ] **18.2 — `tsc --noEmit` limpo no projeto inteiro.**
  ```bash
  ./node_modules/.bin/tsc --noEmit
  ```
  Output esperado: zero erros.

- [ ] **18.3 — `eslint` limpo (convenção do projeto, `npm run lint`).**
  ```bash
  npm run lint
  ```
  Output esperado: zero erros/warnings novos introduzidos por este plano.

- [ ] **18.4 — `npm run build` (garante que Server Actions/Server Components novos
  compilam pro runtime de produção, não só `tsc`).**
  ```bash
  npm run build
  ```
  Output esperado: build verde.

- [ ] **18.5 — Regressão manual: import de EXTRATO de conta idêntico ao de antes.**
  ```bash
  npm run dev
  ```
  - `/accounts/[id]` → importar `Nubank_2026-01-02.ofx` (fixture já existente em
    `/Users/carloshenrique/Downloads/`, formato OFX — caminho 100% inalterado por este
    plano) → prévia + confirmação idênticas ao comportamento anterior.
  - Importar um CSV/XLSX de conta qualquer → idêntico.
  - Importar um PDF de EXTRATO de conta (não fatura) → continua no caminho Gemini
    original (`pdf-parser.ts`), sem passar pelo `card-invoice-parser.ts` novo (roteamento
    validado em T11, mas vale confirmar visualmente 1x).

- [ ] **18.6 — Regressão manual: Telegram (foto/voz) intacto.** Este plano NÃO tocou em
  `modules/telegram/ai-parser.ts` (transação por texto/imagem), `handlers.ts`,
  `draft.ts`, `resolve.ts`, nem no caminho de ÁUDIO (voz continua 100% Gemini, fora de
  escopo — spec, "Fora de escopo: migrar a voz do Telegram... fora deste spec"). Só
  `financing-parser.ts` (documento de financiamento) mudou. Confirmar manualmente com o
  bot real:
  - Mandar uma foto de recibo pro bot → lançamento criado normalmente (Gemini vision,
    inalterado).
  - Mandar uma nota de voz → continua funcionando (Gemini áudio, inalterado).
  - Mandar um PDF/foto de CCB pro fluxo de financiamento do bot (se existir esse gatilho
    no Telegram, ver `document.ts`) → agora usa NVIDIA por baixo, mas o CONTRATO
    (`ParsedFinancing | null`) é o mesmo — comportamento observável do bot não deveria
    mudar.

- [ ] **18.7 — Regressão manual: contrato de financiamento via web.**
  - `/financings` → "Novo financiamento" → importar um PDF de contrato SEM senha →
    campos pré-preenchidos, form editável, salva normalmente.

- [ ] **18.8 — Checklist de segurança antes de considerar o plano concluído.**
  - [ ] `NVIDIA_API_KEY` está setada na Vercel (Production + Preview), NÃO só localmente
    — pedir ao dono pra confirmar em Project Settings → Environment Variables.
  - [ ] As 2 chaves NVIDIA que foram coladas no chat durante o design do spec **foram
    rotacionadas** no painel da NVIDIA (build.nvidia.com) — pedir confirmação explícita
    do dono, não assumir.
  - [ ] Nenhum `console.log`/`console.error` novo introduzido por este plano loga
    conteúdo de documento, senha, ou a API key — grep rápido de sanidade:
    ```bash
    grep -rn "console\.\(log\|error\|warn\)" src/lib/ai/ src/lib/pdf/ src/modules/imports/parsers/card-invoice-parser.ts src/modules/telegram/financing-parser.ts
    ```
    Ler cada ocorrência e confirmar que só loga `status`/`reason`/`detail.slice(0,300)`
    (corpo de erro do PROVIDER, não o payload enviado) — nunca `body`/`content`/`text`/
    `password`/`apiKey`.
  - [ ] Fixtures de PDF real (`src/lib/pdf/__fixtures__/*.pdf`, T1) **NUNCA rastreadas
    pelo git** — repo é PÚBLICO (`githubRepoVisibility public`), commitar documento
    financeiro pessoal do dono vazaria dado real pro mundo. Conferir:
    ```bash
    git ls-files src/lib/pdf/__fixtures__
    ```
    Output esperado: **vazio**. Se algo aparecer, é um vazamento — `git rm --cached` os
    arquivos, confirmar que `.gitignore` (passo 1.2) está correto, e se já foi PUSHED pro
    remoto, tratar como incidente de segurança (rotacionar qualquer dado sensível
    associado, avisar o dono imediatamente — reescrever histórico se necessário).

- [ ] **18.9 — Commit final (só se sobrou algum ajuste solto desta tarefa — normalmente
  T18 é só verificação, sem diff).** Se `eslint --fix`/pequenos ajustes de lint tiverem
  sido necessários:
  ```bash
  git add -A
  git commit -m "chore(imports): ajustes finais de lint/regressão do fluxo de import por IA"
  ```

---

## Ao terminar

Antes de considerar o plano pronto pra execução, rodar a self-review do
`writing-plans`:

1. **Cobertura do spec** — cada decisão aprovada
   (`docs/superpowers/specs/2026-07-11-import-fatura-cartao-credito-design.md`, seção
   "Decisões") tem uma tarefa correspondente: (1) camada de IA provider-agnóstica → T3-T7;
   (2) NVIDIA primário, **Gemini fallback ativo de provider (nunca desabilitado)** →
   `models.ts` `fallback` por role (T4) + cadeia primário→retry→fallback em `extract.ts`
   (T7); (3) deepseek text-only → roteamento hasTextLayer em T10/T13; (4) PDF com senha →
   T1; (5) thinking/reasoning OFF por padrão **em TODO role, sem exceção pra contrato** →
   `models.ts` (T4) + T13 usa `document-text` (mesmo role da fatura) por padrão, upgrade
   pra `document-text-reasoning` só documentado como nota condicional pós-medição (13.6),
   nunca ligado automaticamente; (6) regras de linha da fatura → prompt de T10; (7) dedup
   `(data,valor)` no cartão → T9 (`buildFallbackKey`); (8) parcela = gasto flat → T10
   (nenhum agrupamento, cada linha vira 1 EXPENSE); (9) pipeline generalizado por target →
   T8/T9/T11/T12; (10) frontend nos 2 fluxos + componente compartilhado → T15/T16/T17.
   **Nada do spec ficou sem tarefa.**

2. **Scan de placeholder** — nenhum passo deste plano tem `// TODO`, "implementação
   similar à Task N", ou bloco de código incompleto; todo trecho é código real, completo,
   copiável. As 2 únicas exceções conscientes e documentadas como tal (não são
   placeholder, são limitação técnica real a resolver DEPOIS que dados reais existirem):
   - T2 (spike) tem 3 campos `<PREENCHER>` no comentário de decisão — são resultado de
     uma chamada de rede real contra a NIM, não dá pra saber antes de rodar; o
     comentário existe justamente pra registrar o achado, não pra ficar em aberto.
   - T13 não tem um teste `skipIf` contra um contrato real (T10 tem, porque os 2 PDFs de
     fatura já existiam em `/Downloads`; nenhum contrato de financiamento real estava
     disponível) — reportado como gap explícito abaixo. A nota condicional 13.6
     (upgrade pra reasoning) depende justamente desse contrato real ainda não existir —
     documentada como gatilho futuro, não como trabalho pendente desta tarefa.

3. **Consistência de tipos entre tarefas** — verificado manualmente durante a escrita:
   `ExtractionInput`/`JsonSchema`/`ExtractOpts`/`StructuredExtractor`/`AiModelConfig` (T3,
   agora com `fallback?: AiProvider`) são consumidos com a MESMA assinatura em T5
   (nvidia)/T6 (gemini)/T7 (facade)/T10 (card-invoice-parser)/T13 (financing-parser) — em
   particular a decisão de `prompt` como argumento PRÓPRIO (não embutido em
   `ExtractionInput`) foi propagada consistentemente em todos os 5 pontos de consumo. O
   campo `fallback` novo (correção 2) é escrito só em `models.ts` (T4, `document-text`/
   `document-vision` → `"gemini"`; `document-text-reasoning` sem fallback) e lido só em
   `extract.ts` (T7, `extractorFor(model.fallback)`) — nenhum parser (T10/T13) nem adapter
   concreto (T5/T6) toca nesse campo diretamente, mantendo DIP: `NvidiaNimExtractor`/
   `GeminiExtractor` recebem o `model` já resolvido pelo facade e nunca decidem fallback
   sozinhos. `ImportTarget` (T8) é consumido idêntico em T9 (service)/T11 (parsers/index
   via `opts.kind`)/T12 (actions/schemas)/T16 (frontend). `ImportFileEntry.hasPassword`/
   `password` (T16) fecha com `PasswordProtectedFileField` (T15) e com o `password?` que
   `previewImportAction` aceita desde T12.

## Pontos do spec que não couberam 1:1 numa tarefa (reportar ao revisor)

- **Fatura escaneada/foto → visão (qwen) recebendo PDF inteiro como `image_url`** (T10):
  o spec pede esse fallback, mas nenhuma etapa deste plano valida se a API da NIM aceita
  PDF bruto num campo pensado pra imagem — só imagem rasterizada (JPEG/PNG). Se o spike
  (T2) ou o teste real de T10 (10.8) mostrar que NÃO aceita, a correção é renderizar a 1ª
  página do PDF em PNG antes de mandar (precisa de `sharp` + `unpdf.extractImages`, uma
  dependência nova não pedida pelo spec) — fica como melhoria de follow-up, não bloqueia
  o caminho principal (PDF com text layer, que é o caso comum de fatura).
- **Teste de `financing-parser` contra um contrato real** (spec, seção "Testes"): não
  havia nenhum PDF de CCB/contrato real disponível nos fixtures pra espelhar o
  `describe.skipIf` que T10 tem com as 2 faturas. T13 cobre roteamento + erro-como-dado
  100% mockado. Se o dono tiver um contrato real mais adiante, adicionar o teste
  `skipIf` é o próximo passo natural.
- **Responsibilidade do `response_format` estruturado da NIM** (spec, "Riscos": "Structured
  output no NIM: confirmar json_schema/guided por modelo no spike"): este plano usa
  prompt-constrained (schema embutido no texto do prompt) como baseline em T5 SEMPRE,
  independente do resultado do spike (T2) — é a decisão mais segura pra não bloquear o
  resto do plano numa resposta incerta de rede. Se o spike confirmar suporte a
  `response_format` nativo, isso é uma OTIMIZAÇÃO de latência/confiabilidade pra
  adicionar depois em `nvidia.ts` (`buildExtraBody`/request body), não uma correção —
  reportar como sugestão de melhoria separada quando/se confirmado.

## Improvement Suggestions (separado das tarefas acima — não implementar junto)

- `card-invoice-parser.ts`/`financing-parser.ts` (fallback visão): renderizar a 1ª página
  do PDF escaneado em PNG (`unpdf.extractImages` + `sharp`) antes de mandar pro qwen, em
  vez de mandar o PDF bruto — só se o teste real mostrar que a NIM rejeita PDF inline em
  `image_url`.
- `models.ts` `document-text-reasoning`: `reasoningBudget: 1024` é um valor inicial —
  ajustar pra cima se, depois de LIGAR o upgrade condicional de T13 (13.6), os testes
  reais de `financing-parser` (quando houver um contrato real disponível) ainda
  mostrarem confusão de campo mesmo com reasoning ligado.
- Migrar a voz do Telegram (áudio) do Gemini pra NVIDIA (omni/ASR) — explicitamente fora
  de escopo pelo spec, mas natural follow-up já que a camada de IA (`extractStructured`)
  já existe.
- Fase 2 do fluxo de fatura (spec, "Fora de escopo"): agrupar linhas de parcela
  importadas num `InstallmentPurchase` em vez de gasto flat — precisa de UI de revisão
  antes de gravar (hoje o usuário não tem chance de "juntar" parcelas na prévia).

