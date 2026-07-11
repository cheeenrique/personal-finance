# Refino de categoria no recibo/Telegram — override + item-aware

> **SUPERSEDED — feature removida em 2026-07-11.** `MerchantCategoryRule` e o
> override merchant→categoria descritos aqui foram removidos por inteiro
> (front, back e tabela). Registro histórico, não reflete o comportamento
> atual — ver `docs/30-TELEGRAM.md`.

Data: 2026-07-08
Status: design aprovado (escopo), aguardando revisão do spec

## Problema

Ao mandar recibo/foto no Telegram (ou importar), a categoria sai errada em
merchant ambíguo. Ex.: "Filial Eldora" — o histórico do usuário está dividido
(**Mercado 14x vs Farmácia 4x**), e o sistema alimenta o Gemini com a categoria
DOMINANTE de cada merchant (`listKnownMerchants` → "Eldora → Mercado"). Então a
IA segue a maioria e erra o que o usuário quer (Farmácia). Não é erro aleatório
da IA — é o histórico ambíguo mandando.

Segunda dor (fora de escopo desta rodada, ver "Adiado"): tela de e-commerce
itemizada/parcelada (pedido Mercado Livre, "10x R$ 8,54") faz o Gemini retornar
`isTransaction=false` ("não consegui identificar um lançamento").

## Decisão (aprovada)

Fazer **os dois**, nesta ordem de prioridade ao resolver a categoria:

1. **Regra de override merchant→categoria** (determinística, definida pelo
   usuário) — GANHA de tudo.
2. **Categoria inferida por ITEM** do recibo (IA) — quando não há override.
3. Dominante do histórico / escolha da IA pela lista — fallback atual.

## Parte 1 — Override merchant→categoria

### Dados

Novo model Prisma `MerchantCategoryRule`:

```
id         String  @id @default(cuid())
userId     String
pattern    String   // texto normalizado do merchant (ex.: "eldora")
categoryId String
createdAt/updatedAt/deletedAt
@@unique([userId, pattern])
```

Migration aplicada via **Supabase MCP** (`apply_migration`) + `schema.prisma`
atualizado + client regenerado (não rodar `prisma migrate dev` cego contra o
prod — coordenar, ver [[use-supabase-mcp-for-db]]).

### Módulo

Novo `src/modules/merchant-rules/` (SRP — regra de categorização não é
transação nem categoria): repository (CRUD escopado por userId + deletedAt) +
service. Função-chave: `resolveCategoryOverride(userId, description)` →
`categoryId | null`. Match: normaliza a descrição (lowercase, sem acento, sem
ruído de CNPJ/prefixo tipo "Compra débito -") e verifica se algum `pattern`
(também normalizado) é substring dela. Retorna a categoria da 1ª regra que casa
(regra mais específica primeiro — pattern mais longo).

### Wiring (o override GANHA)

- **Telegram** (`modules/telegram/handlers.ts` / `resolve.ts` `resolveCategoryId`):
  depois de extrair a `description`, consultar `resolveCategoryOverride` ANTES
  de usar a `categoryName` da IA. Se casar, usa a categoria da regra.
- **Import** (`modules/imports/service.ts` `resolveCategoryId`): idem, antes do
  `lastCategoryForDescription`.
- NÃO mexer no dedup nem no fluxo de pergunta.

### UI (mínima)

Seção em `/settings` (ou `/categories`) pra listar/criar/excluir regras
(pattern → categoria), seguindo os padrões de form/list já existentes. Sem lib
nova.

### Seed imediato

Criar a regra "eldora → Farmácia" pro usuário (necessidade concreta dele) assim
que o mecanismo existir.

## Parte 2 — Categoria por item (recibo imagem)

Ajustar `buildImagePrompt` (`modules/telegram/ai-parser.ts`):

- Quando a imagem for recibo/nota com ITENS, instruir o Gemini a considerar os
  PRODUTOS (não só a loja) ao escolher `categoryName` — especialmente quando a
  loja é generalista (mercado+farmácia). Continua saída de UMA transação (o
  total + a categoria inferida dos itens), sem extrair lista de itens pro schema
  (YAGNI — só melhora a escolha da categoria).
- Deixar explícito no prompt a ordem: se houver override do sistema, ele já foi
  aplicado por fora (determinístico); a IA cuida do caso sem regra.
- Manter tudo o que já funciona (type/amount/description/paymentMethod/origin).

## Ordem de resolução final (documentar no código)

`override (parte 1) > categoria-por-item da IA (parte 2) > dominante/lista > null→default`.

Para Eldora com override "→ Farmácia": vira Farmácia sempre, independente de
itens (bico de mamadeira) ou da dominante (Mercado). É o que o dono quer.

## Adiado (parte 3, fora desta rodada)

Tela e-commerce itemizada/parcelada (ML "10x R$ V") — reconhecer total via N×V
e/ou detectar parcelamento e oferecer registro. Fica pra próxima. Por ora essas
compras são cadastradas na mão (como o parcelamento do bico já foi).

## Verificação

Repo sem framework de teste (não instalar). Override: verificar
`resolveCategoryOverride` com script tsx (Eldora casando variações de grafia;
sem regra → null). Wiring: tsc + eslint. Prompt (parte 2): revisão manual do
texto + tsc. Extração real de imagem só valida ao vivo com `GEMINI_API_KEY`.
