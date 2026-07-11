# Import de fatura de cartão de crédito — design

Data: 2026-07-11
Status: aprovado (aguardando revisão do spec antes do plano)

## Objetivo

Permitir importar a **fatura de um cartão de crédito** (PDF, inclusive
protegido por senha; e os demais formatos já suportados) e gravar os
lançamentos **dentro do cartão** — reusando ao máximo o pipeline de import de
extrato que hoje só atende **conta bancária**.

Escopo desta iteração: import flat (cada linha da fatura = 1 lançamento no
cartão). Agrupar linhas importadas num parcelamento é **fase 2** (spec próprio).

## Contexto atual (o que já existe)

- `src/modules/imports/service.ts` — `previewImport`/`commitImport`, hoje
  presos a **conta** (`accountId`, `assertAccountOwnership`).
- `src/modules/imports/repository.ts` — `findExistingFitIds`, `findFallbackRows`,
  `insertMany`, todos por `accountId`; índice único parcial `(accountId, fitId)`.
- `src/modules/imports/parsers/index.ts` — dispatch por extensão:
  `tabular.ts` (CSV/XLSX, determinístico), `ofx-parser.ts`, `pdf-parser.ts`
  (via Gemini, prompt de **extrato bancário**, `parsePdfStatement`).
- Dedup: `fitId` (OFX) ou fallback `(date, amount, description)` — funções
  puras (`fallbackKey`/`isDuplicate`/`buildDedupState`), já target-agnósticas.
- Categoria: `transactionService.lastCategoryForDescription` (histórico); `null`
  quando não resolve (nunca inventa).
- UI: `src/components/accounts/*` — dropzone multi-arquivo, 1 preview + 1 commit
  por arquivo (`use-import-files.ts`, `import-types.ts`).
- Fatura de cartão (docs/22-CREDIT_CARDS.md): **não há tabela Statement**. A
  fatura é o conjunto de `Transaction` com `cardId` cujo `date` cai no ciclo
  (`closingDay`/`dueDay` em America/Sao_Paulo). Compra no cartão =
  `type=EXPENSE`, `cardId` set, `accountId=null`, `isPaid=true`, categorizada.

## Decisões (aprovadas)

1. **Generalizar o pipeline por `target`** (`conta` | `cartão`), não duplicar.
2. **PDF com senha = extração de TEXTO** (abordagem A1): abrir o PDF com a
   senha via lib JS/WASM (pdfjs-dist/unpdf), extrair texto, mandar o **texto**
   pro Gemini. Uniforme (com e sem senha), leve, sem re-serializar PDF cifrado.
   O caminho de **extrato bancário** (conta) continua como está (bytes→Gemini);
   só o caminho de **fatura** (cartão) usa extração de texto.
3. **Linhas da fatura**: compras + encargos (IOF/juros/anuidade/seguro) =
   `EXPENSE`; estornos/créditos = `INCOME`; linha de **pagamento da fatura
   anterior** e **saldo anterior** = IGNORADAS (senão dupla contagem).
4. **Dedup no cartão = `(data, valor)`** (sem descrição — a descrição da fatura
   difere da lançada pelo bot/manual, ex.: "GABOLA\*REST" vs "Gabola"). Escopado
   ao `cardId`. Preview mostra novos/duplicados/erros como hoje.
5. **Parcela = gasto simples** (flat). Sem reconstruir `InstallmentPurchase`
   (a fatura só mostra a parcela do mês, não a compra inteira).
6. **Senha por arquivo na UI**: toggle "tem senha?" → se marcado, campo de
   senha. Sem marcar, tenta direto.

## Arquitetura

### Costuras target-específicas (o que muda)

O pipeline tem 3 pontos presos a conta; viram target-aware:

- **Ownership** — `assertAccountOwnership(accountId)` → `assertTargetOwnership(target)`
  (conta via `accountRepository`, cartão via `cardRepository`).
- **Query de linhas existentes p/ dedup** — `findFallbackRows(accountId)` →
  `findFallbackRows(target)` (filtra por `accountId` OU `cardId`). `fitId` só
  existe no caminho de conta (OFX); cartão é sempre fallback.
- **Chave de dedup** — `fallbackKey` passa a depender do target:
  conta = `(data, valor, descrição)`; cartão = `(data, valor)`.
- **Insert** — `insertMany(target, rows)`: conta grava como hoje; cartão grava
  `cardId` set, `accountId=null`, `isPaid=true`, `type` EXPENSE/INCOME,
  `categoryId` resolvido, `date` da compra (cai na fatura certa sozinho).

Tudo o mais (preview, `isDuplicate`, categorização, contrato erro-como-dado,
componente de dropzone) é reusado sem cópia.

### Tipo `ImportTarget`

```ts
type ImportTarget =
  | { kind: "account"; accountId: string }
  | { kind: "card"; cardId: string };
```

`previewImport`/`commitImport` recebem `target: ImportTarget` no lugar de
`accountId: string`. As actions (`previewImportAction`/`commitImportAction`)
passam a receber o target + `password?: string` por arquivo.

### Parser de fatura

- `parseImportFile(fileName, fileContent, opts?: { kind, password })`:
  - `kind="account"` (default) → comportamento atual (statement).
  - `kind="card"` + PDF → **novo `parseCardInvoice`**: extrai texto do PDF
    (com `password` se veio), monta prompt de FATURA, chama Gemini
    (`callGemini`, mesmo transporte — flash-lite, thinking off), valida com zod.
  - CSV/XLSX de fatura → reusam `tabular.ts` (determinístico) — só o insert muda.
- **Prompt de fatura** (novo): extrai `{date, amount, type, description}` por
  linha; regras — compras/encargos → EXPENSE; estorno/crédito → INCOME; ignorar
  pagamento da fatura anterior, saldo anterior, totais, cabeçalho/rodapé.
- **Extração de texto**: lib JS/WASM (pdfjs-dist/unpdf) que roda em serverless
  Vercel (Node 24, sem binário nativo). `getDocument({ data, password })` →
  `getTextContent()`. Senha errada → erro tipado → erro-como-dado do arquivo.

### UI

- Botão **"Importar fatura"** no detalhe do cartão (mesmo dropzone dos extratos).
- Por arquivo: checkbox **"tem senha?"** → campo de senha condicional.
- Reusa `use-import-files.ts`/`import-types.ts` com `target` + `password` no
  estado do arquivo.

## Fluxo de dados

1. Usuário abre "Importar fatura" no cartão → solta os PDFs → marca senha onde
   precisa → "Analisar".
2. `previewImportAction(target={card,cardId}, fileName, content, password?)` →
   `parseImportFile` → (PDF card) extrai texto c/ senha → Gemini fatura →
   `{date, amount, type, description}[]`.
3. Preview classifica novos/duplicados (dedup `(data,valor)` no cartão)/erros.
4. Usuário confirma → `commitImportAction` reusa as transações da prévia (não
   reparseia — evita 2ª chamada Gemini) → `insertMany` grava no cartão dentro
   de `$transaction` com dedup + `skipDuplicates`.

## Tratamento de erro (erro-como-dado, por arquivo)

- Senha errada / PDF cifrado sem senha informada → `ImportParseError` claro
  ("senha incorreta" / "PDF protegido — marque 'tem senha'"), não derruba os
  outros arquivos.
- Gemini indisponível/timeout/JSON fora do shape → `{ transactions: [], errors }`
  (mesmo contrato atual).
- Item individual malformado → erro isolado, não descarta a fatura inteira.

## Fora de escopo (YAGNI / fases futuras)

- **Fase 2**: selecionar linhas importadas e agrupá-las num `InstallmentPurchase`
  (parcelamento) — spec próprio.
- Reconstruir parcelamento automaticamente a partir de "PARCELA 03/10".
- Mudar o caminho de extrato bancário (conta) — fica intacto.

## Testes

- `parseCardInvoice` validado com os 2 exemplos reais: `Fatura.pdf` (senha
  `028574373`) e `Nubank_2026-07-08.pdf` (sem senha) — confere que extrai as
  compras, marca estorno como INCOME, ignora pagamento/saldo anterior.
- Dedup `(data, valor)` no cartão (funções puras).
- Extração de texto: senha certa (ok), senha errada (erro tipado), PDF sem senha
  (ok).
- Regressão: import de conta (extrato) segue idêntico.

## Riscos

- **Lib de PDF em serverless**: validar que pdfjs-dist/unpdf abre PDF com senha
  e roda no runtime da Vercel (peso do bundle, cold start). Plano de implementação
  começa por um spike dessa lib com os 2 PDFs reais antes do resto.
- **Qualidade da extração de texto** de layouts de fatura variados — mitigado
  pelo Gemini estruturando o texto + validação zod + preview antes de gravar.
