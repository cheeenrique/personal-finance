# Import de documentos financeiros (fatura de cartão + contrato de financiamento) — design

Data: 2026-07-11
Status: aprovado (aguardando revisão do spec antes do plano)

## Objetivo

Dois fluxos de ingestão de documento por IA, compartilhando uma camada de IA
**provider-agnóstica e reutilizável** (NVIDIA NIM como primário, Gemini
opcional):

- **Fluxo 1 — Import de FATURA de cartão**: PDF (inclusive com senha) + demais
  formatos → lançamentos gravados **dentro do cartão**. Reusa/generaliza o
  pipeline de import de extrato (hoje só **conta**).
- **Fluxo 2 — Import de CONTRATO de financiamento (CCB)**: já existe
  (`FinancingImportButton` → `parseFinancingFromDocument`) — passa a usar a
  camada de IA nova + extração de texto/senha. Continua só pré-preenchendo o
  form (não cria o Loan).

Fatura: import flat (1 linha = 1 lançamento). Agrupar em parcelamento = **fase 2**.

## Contexto atual

- **Import de extrato** — `src/modules/imports/*`: `previewImport`/`commitImport`
  presos a **conta** (`accountId`); dedup (fitId ou fallback `date,amount,desc`,
  funções puras); categoria por histórico; UI multi-arquivo
  (`src/components/accounts/*`). Parsers por extensão: `tabular` (CSV/XLSX),
  `ofx`, `pdf` (Gemini, bytes).
- **Import de contrato** — `src/modules/telegram/financing-parser.ts`
  (`parseFinancingFromDocument`, Gemini bytes → `ParsedFinancing`), disparado no
  web por `financing-import-button.tsx` → `parseFinancingDocumentAction`.
- **IA** — `src/lib/ai/gemini.ts` (`callGemini`): único transporte, Gemini-shaped.
- **Fatura de cartão** (docs/22): sem tabela Statement — é o conjunto de
  `Transaction` com `cardId` no ciclo. Compra = EXPENSE, `cardId` set,
  `accountId=null`, `isPaid=true`, categorizada.

## Decisões (aprovadas)

1. **Camada de IA provider-agnóstica** (port/adapter, SOLID) — NVIDIA NIM
   primário, Gemini opcional/fallback. Registry central de modelos.
2. **NVIDIA substitui o Gemini neste feature** (free tier do Gemini é pequeno):
   texto = `deepseek-ai/deepseek-v4-pro`; visão = `qwen/qwen3.5-397b-a17b`;
   texto-com-raciocínio (opcional) = `nvidia/nemotron-3-nano-30b-a3b`. Voz do
   Telegram (áudio) fica no Gemini — migração à parte, fora deste spec.
3. **deepseek é text-only** → PDF com text layer → extrai TEXTO → deepseek;
   foto/PDF escaneado (sem text layer) → fallback VISÃO no qwen VLM.
4. **PDF com senha = extração de texto** (pdfjs/unpdf abre com a senha).
5. **thinking/reasoning OFF por padrão**, configurável **por role** no registry.
   Ligar leve só se o spike mostrar erro (candidato: contrato, campos
   ambíguos principal/bem/entrada → `nemotron` com `reasoning_budget`).
6. **Fatura — linhas**: compras + encargos = EXPENSE; estornos = INCOME;
   pagamento fatura anterior / saldo anterior = IGNORADOS.
7. **Fatura — dedup `(data, valor)`** no `cardId`.
8. **Fatura — parcela = gasto flat**.
9. **Pipeline de transação generalizado por `target`** (`conta` | `cartão`).
   Contrato NÃO usa esse pipeline (produz termos de Loan) — só a camada de IA.
10. **Frontend nos 2 fluxos** + componente compartilhado de arquivo+senha.

## Arquitetura da camada de IA (reutilizável, SOLID)

Estrutura de pastas:

```
src/lib/ai/
  types.ts       # ExtractionInput, StructuredExtractor (porta), contrato de erro
  models.ts      # REGISTRY: role -> { provider, model, params, modality }  (fonte única)
  nvidia.ts      # NvidiaNimExtractor (adapter OpenAI-compatible)
  gemini.ts      # GeminiExtractor (adapter; wrap do callGemini atual)
  extract.ts     # extractStructured(role, input, schema, parse, opts) — facade/router
src/lib/pdf/
  extract-text.ts # extractPdfText(bytes, password?) -> { text, hasTextLayer }
```

### Porta (DIP) — parsers dependem disto, nunca de um provider concreto

```ts
type ExtractionInput =
  | { kind: "text"; text: string }
  | { kind: "vision"; bytes: Buffer; mimeType: string };

interface StructuredExtractor {
  // nunca lança; null em qualquer falha (LSP: todo adapter honra isso)
  extract<T>(input: ExtractionInput, schema: JsonSchema, parse: (raw: unknown) => T | null, opts?: ExtractOpts): Promise<T | null>;
}
```

### Registry de modelos (`models.ts`) — fonte única, troca de modelo em 1 lugar

```ts
type AiRole = "document-text" | "document-text-reasoning" | "document-vision";
// role -> { provider: "nvidia" | "gemini", model, modality, params }
// document-text          -> nvidia, deepseek-ai/deepseek-v4-pro,  thinking:false
// document-text-reasoning-> nvidia, nvidia/nemotron-3-nano-30b-a3b, reasoning_budget:N
// document-vision        -> nvidia, qwen/qwen3.5-397b-a17b
```

Trocar de modelo/provider = editar o registry, sem tocar em parser (OCP).

### Adapters

- **`NvidiaNimExtractor`** — POST `integrate.api.nvidia.com/v1/chat/completions`,
  `Authorization: Bearer ${NVIDIA_API_KEY}`, `stream:false`. Isola os quirks por
  modelo (SRP): texto → `messages:[{role:user, content:text}]`; visão →
  `content:[{type:image_url, image_url:{url:"data:<mime>;base64,<b64>"}}]`;
  thinking → `extra_body.chat_template_kwargs.thinking`; reasoning →
  `extra_body.reasoning_budget`. Structured output: `response_format` json se o
  modelo suportar (**verificar no spike**), senão prompt-constrained.
- **`GeminiExtractor`** — wrap do `callGemini` atual; adapter opcional
  (fallback por config / caminhos do Telegram inalterados).

### Facade (`extractStructured`)

`extractStructured(role, input, schema, parse, opts)`:
1. resolve `{provider, model, params}` do registry pela `role`;
2. chama o adapter; **valida com zod** (nunca confia em JSON de LLM); **1 retry**
   em falha de parse; `null` no fim → erro-como-dado.

Parsers só chamam isto com role + prompt + schema + parse. Não conhecem provider,
modelo, nem quirk de request (SRP/DIP/DRY).

## Fluxo 1 — Fatura (pipeline de transação generalizado)

Costuras target-específicas (resto reusado: preview, `isDuplicate`, categoria, UI):

```ts
type ImportTarget = { kind: "account"; accountId: string } | { kind: "card"; cardId: string };
```

- **Ownership** `assertTargetOwnership(target)`; **dedup query** `findFallbackRows(target)`;
  **chave** conta `(data,valor,desc)` / cartão `(data,valor)`; **insert**
  `insertMany(target, rows)` (cartão: `cardId` set, `accountId=null`,
  `isPaid=true`, EXPENSE/INCOME, `categoryId`, `date` da compra).
- `parseImportFile(fileName, content, opts?: { kind, password })`:
  - conta → statement atual;
  - cartão + PDF → **`card-invoice-parser.ts`**: `extractPdfText(bytes,password)`
    → `extractStructured("document-text", {text}, INVOICE_SCHEMA, parse)`;
    `hasTextLayer=false` → `extractStructured("document-vision", {vision:bytes}, ...)`;
  - CSV/XLSX → `tabular` (só o insert muda).

## Fluxo 2 — Contrato de financiamento (fluxo próprio, reusa a camada de IA)

`parseFinancingFromDocument(bytes, mimeType, password?)` refatora pra:
- **PDF** → `extractPdfText(bytes,password)` → `extractStructured("document-text",
  {text}, FINANCING_SCHEMA, parse)` (reusa `buildFinancingPrompt`/
  `parsedFinancingSchema` já existentes). Confusão de campo no spike →
  `role:"document-text-reasoning"` (nemotron + reasoning_budget).
- **Foto / escaneado** → `extractStructured("document-vision", {vision:bytes}, ...)`.
- `parseFinancingDocumentAction` ganha `password?`. Form modal / save inalterados.

## Frontend (nos 2 fluxos)

- **Componente compartilhado** `PasswordProtectedFileField` (`src/components/
  imports/`): input de arquivo + toggle "tem senha?" + campo de senha condicional.
- **Fatura**: botão "Importar fatura" no detalhe do cartão, reusando o dropzone
  multi-arquivo dos extratos (generalizado p/ `target`) + o campo de senha por arquivo.
- **Contrato**: `financing-import-button.tsx` passa a usar o mesmo
  `PasswordProtectedFileField`.

## Tratamento de erro (erro-como-dado)

- Senha errada / cifrado sem senha → erro claro por arquivo, não derruba os outros.
- IA (NIM/Gemini) indisponível/timeout/JSON fora do shape → `null` → erro-como-dado.
- Rate limit do NIM free → fallback Gemini por config (registry).
- Item malformado → erro isolado, não descarta o documento.

## Fora de escopo (fases futuras)

- **Fase 2**: agrupar linhas importadas num `InstallmentPurchase`.
- Migrar a **voz do Telegram** (áudio) do Gemini pra NVIDIA (omni/ASR).
- Criar o Loan automaticamente no import de contrato.

## Testes

- `card-invoice-parser` (texto→deepseek) com 2 faturas reais: `Fatura.pdf`
  (senha `028574373`), `Nubank_2026-07-08.pdf` (sem senha).
- `parseFinancingFromDocument` (texto→deepseek) com contrato real.
- `extractPdfText`: senha certa/errada/sem senha + detecção de "sem text layer".
- Adapters: contrato de erro (nunca lança → null), roteamento por `role`.
- Dedup `(data,valor)` no cartão (puro).
- Regressão: extrato (conta) e Telegram (foto/voz) intactos.

## Riscos

- **Structured output no NIM**: confirmar json_schema/guided por modelo no spike;
  senão prompt-constrained + zod + retry.
- **Free tier NIM**: rate limit/SLA; fallback Gemini por config. Privacidade:
  dado financeiro no free tier (checar retenção/treino).
- **deepseek text-only**: depende do text layer; escaneado → vision (qwen).
- **Lib PDF em serverless**: peso/cold start pdfjs/unpdf — spike primeiro.

## Segurança

`NVIDIA_API_KEY` só em env (`.env` local + Vercel); placeholder em `.env.example`.
As 2 chaves NVIDIA coladas no chat durante o design devem ser **rotacionadas**.
Nunca logar conteúdo de documento, senha, nem API keys.

## Ordem do plano (writing-plans)

1. **Spike**: `extractPdfText` (pdfjs/unpdf com senha, na Vercel) + `NvidiaNimExtractor`
   contra deepseek/qwen usando os PDFs reais — valida guided-JSON, text layer,
   qualidade, rate limit. Decide detalhes de request antes do resto.
2. Camada de IA reutilizável (types/models/nvidia/gemini/extract).
3. Fluxo 1 (generalizar pipeline por target + card-invoice-parser + UI).
4. Fluxo 2 (refatorar financing-parser + password + UI).
5. Testes + regressão.
