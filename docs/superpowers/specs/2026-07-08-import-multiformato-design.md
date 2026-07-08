# Import de extrato multi-formato — CSV, XLS/XLSX, PDF (via Gemini)

Data: 2026-07-08
Status: design aprovado (formatos + Gemini), aguardando o fix de dedup OFX (#3)
antes de implementar (mesmo módulo `imports`).

## Objetivo

Hoje o módulo `imports` só lê OFX. Estender pra CSV, XLS/XLSX e PDF, sem
duplicar o pipeline de dedup/categorização/commit já existente.

Decisões do dono:
- Formatos: **CSV, XLS/XLSX e PDF** (os três).
- PDF via **Gemini** liberado (aceita enviar o conteúdo do extrato pro Google).

## Dependência

**Bloqueado pelo #3** (fix do dedup fallback count-aware por dia+valor+desc).
CSV/XLS/PDF em geral NÃO têm `fitId` — dependem inteiramente do fallback
robusto. Implementar #5 antes do #3 herdaria o bug de duplicata. Além disso os
dois mexem no mesmo módulo `imports` — serializar evita conflito.

## Arquitetura — parsers plugáveis

Generalizar de "OFX" pra "import de extrato". Núcleo:

```
arquivo → [parser por formato] → ParsedTransaction[] → pipeline atual
                                                        (preview → dedup → commit)
```

- `ParsedTransaction` (shape já existente: `fitId | null`, `date`, `amount`,
  `type`, `description`) vira o contrato comum. Todo parser produz isso.
- Seleção de parser por extensão/conteúdo do arquivo (`.ofx`, `.csv`,
  `.xls`/`.xlsx`, `.pdf`).
- `previewOfxImport`/`commitOfxImport` viram genéricos (`previewImport`/
  `commitImport`) recebendo o resultado já parseado — a lógica de dedup/commit
  não muda (só o #3 a endurece). OFX continua sendo um dos parsers.

Arquivos novos prováveis: `imports/parsers/csv-parser.ts`,
`imports/parsers/xlsx-parser.ts`, `imports/parsers/pdf-parser.ts`,
`imports/parsers/index.ts` (registry + detecção). `ofx-parser.ts` move pra
`parsers/`. Nada de lógica de domínio fora de `modules/` (regra de ouro).

## Parsers

### CSV (determinístico, sem IA)

- Detecta delimitador (`,`/`;`/tab).
- Mapeia colunas por header (`data`/`date`, `valor`/`amount`, `descrição`/
  `histórico`/`description`, opcional `tipo`). Layout desconhecido → passo de
  **mapeamento de coluna** no modal (usuário confirma qual coluna é o quê).
- Parsing de data multi-formato (dd/mm/yyyy, yyyy-mm-dd) → meia-noite SP (mesmo
  destino do OFX). Sinal do valor → `type` (negativo=EXPENSE, positivo=INCOME),
  ou coluna de tipo quando existir.

### XLS/XLSX (determinístico)

- Lib de leitura de planilha (decisão de plano: `xlsx`/SheetJS vs `exceljs` —
  avaliar footprint e licença). Lê a 1ª aba → linhas → MESMO mapeamento de
  coluna do CSV (reuso, não duplicar).

### PDF (via Gemini) — REUSA o client que já existe

- **Já temos Gemini no projeto** (decisão do dono confirmada): `src/modules/
  telegram/ai-parser.ts` expõe `callGemini(contents, ...)` — REST pra
  `generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash`, env var
  `GEMINI_API_KEY` (já configurada), timeout + erro→null, aceita PDF via
  `inlineData` (`mimeType: "application/pdf"`). `financing-parser.ts` já faz
  extração estruturada de PDF de banco (prompt + zod schema + `responseSchema`)
  — é o TEMPLATE direto pro `pdf-parser`. SEM dep nova, SEM AI SDK/Gateway.
- Arquitetura: extrair o transporte genérico (`callGemini`, `GeminiContentPart`,
  modelo/base/timeout) pra `src/lib/ai/gemini.ts` (infra, não domínio) e apontar
  tanto `telegram/ai-parser.ts` quanto `imports/pdf-parser.ts` pra lá, SEM mudar
  o comportamento do Telegram. Se a extração ficar invasiva demais no fluxo do
  Telegram (crítico), fallback: `pdf-parser` importa `callGemini` do
  `ai-parser` e deixa a extração pra depois — reportar o trade-off.
- `pdf-parser`: monta prompt + schema zod de transações (data ISO, valor decimal
  string, tipo EXPENSE/INCOME, descrição), manda o PDF como `inlineData`,
  valida a saída, normaliza pro `ParsedTransaction[]` (data → meia-noite SP,
  `fitId` null). Nunca loga conteúdo do extrato nem a key (mesmo racional do
  `ai-parser`).
- Sem `fitId` → cai no fallback de dedup (por isso depende do #3, já pronto).

## UI

- Modal de import (`components/accounts/ofx-import-*`) generaliza: aceita os
  novos tipos de arquivo (input `accept`), detecta formato, e mostra o mesmo
  preview (novos/duplicados/erros).
- CSV/XLS: quando o layout não é reconhecido, passo de mapeamento de coluna
  antes do preview.
- PDF: estado de "extraindo…" (chamada ao Gemini é assíncrona/latente).

## Decomposição sugerida (entrega única, mas em fases de implementação)

1. Generalizar o pipeline (parser registry + `ParsedTransaction` como contrato)
   + **CSV**.
2. **XLSX** (reusa mapeamento do CSV).
3. **PDF + Gemini**.

Cada fase é verificável de forma independente.

## Decisões deixadas pro plano

- Lib de XLSX (`xlsx` vs `exceljs`).
- Acesso ao Gemini (AI Gateway vs SDK direto) + modelo exato + env var.
- Profundidade do mapeamento de coluna (auto-heurística vs UI sempre).

## Fora de escopo

- Reconciliação/matching contra transações já lançadas manualmente além do que
  o dedup fallback já cobre.
- Import de fatura de cartão (fluxo separado, `financing-import-button` é outra
  coisa).
