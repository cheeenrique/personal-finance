# CARD_PAYMENT sempre com cardId + accountId — design

Status: investigação concluída, aguardando implementação. Owner-approved direction (ver prompt original).

---

## 1. Contexto / Problema

`type=CARD_PAYMENT` é criada hoje por dois caminhos com invariantes diferentes:

- `src/modules/cards/pay-invoice.ts:79-91` — cria a Transaction direto via `tx.transaction.create`,
  **sempre** com `accountId` (conta pagadora) + `cardId` (fatura abatida) preenchidos. Correto, já
  documentado em `docs/22-CREDIT_CARDS.md:145-149`.
- `src/modules/transactions/schemas.ts` (`createTransactionSchema`, `updateTransactionSchema`) — o
  `.refine` de origem exige XOR estrito (`Boolean(accountId) !== Boolean(cardId)` na criação,
  `!(accountId && cardId)` no update), sem exceção para `CARD_PAYMENT`. `service.ts`
  `assertSourceAndCategoryInvariant` (linha 34-53) reforça a mesma XOR contra o estado mesclado.

Isso quebra:

- (a) A feature nova "fatura paga/atrasada" (uncommitted: `src/modules/cards/service.ts`
  `computeLastInvoiceFields`/`lastClosedInvoiceStatus`, `repository.ts`
  `findCardPaymentsInRange`/`listCardPaymentsForCards`) atribui pagamento a um cartão filtrando
  `cardId = <card>` na query — uma `CARD_PAYMENT` com `cardId IS NULL` nunca aparece em nenhum
  cartão, mesmo tendo debitado a conta.
- (b) Dado errado: um pagamento de fatura sem saber qual fatura pagou.

**Achado da investigação — de onde vieram os 6 orphans:**

O formulário genérico de criação (`src/components/forms/new-transaction-form.tsx`) **não expõe
`CARD_PAYMENT` como tipo selecionável hoje** — `QUICK_TYPES` (linha 33-36) só tem
`EXPENSE`/`INCOME`, e o JSDoc do componente (linha 61-66) documenta a decisão: "Transferência e
Pagamento de fatura usam schemas/fluxos próprios... e ganham telas dedicadas". `PayInvoiceModal`
(`src/components/cards/pay-invoice-modal.tsx`) é essa tela dedicada e só captura `accountId`
(`cardId` vem fixo da página do cartão) — sempre produz as duas colunas corretas via
`payInvoiceForClient` → `pay-invoice.ts`.

Porém `src/components/transactions/edit-transaction-modal.tsx` **edita** `CARD_PAYMENT` (mostra o
tipo, trava categoria — linha 54, 152-155) usando um único campo `origin` (linha 62, 85-87,
222-235) que funde conta/cartão num único `EntitySelect`. No populate (linha 85-87):

```ts
setOrigin(
  transaction.accountId ? `account:${transaction.accountId}` : transaction.cardId ? `card:${transaction.cardId}` : undefined,
);
```

Como uma `CARD_PAYMENT` correta tem `accountId` preenchido, `origin` vira sempre `account:<id>` —
**o `cardId` original nunca é carregado no form**. No submit (linha 114, 120-122):

```ts
const [originKind, originId] = origin.split(":") as ["account" | "card", string];
...
accountId: originKind === "account" ? originId : null,
cardId: originKind === "card" ? originId : null,
```

Isso envia `cardId: null` explicitamente. `updateTransactionSchema` aceita (só bloqueia os dois
preenchidos ao mesmo tempo) e `assertSourceAndCategoryInvariant` no estado mesclado aceita
(`accountId` truthy XOR `cardId` null = passa). **Qualquer edição de uma `CARD_PAYMENT` já correta
através deste modal apaga o `cardId`.** Esse é o mecanismo mais plausível para os 6 registros
órfãos (dado que o form de criação nunca permite chegar em `CARD_PAYMENT` sem os dois campos) —
documentado aqui como achado, não como fato confirmado (não há audit log de qual fluxo tocou cada
linha).

Isso muda o foco da correção de UI: não é o form de criação que precisa mudar (ele já não expõe
`CARD_PAYMENT`, e deve continuar assim — ver seção 3), é o **modal de edição** que precisa parar de
fundir conta/cartão num único campo para esse tipo.

---

## 2. Mudança de schema (`src/modules/transactions/schemas.ts`)

### `createTransactionSchema`

Substituir o primeiro `.refine` (linhas 38-41) por um `.superRefine` type-aware — preserva os dois
`.refine` de categoria (linhas 42-49) inalterados, eles já tratam `CARD_PAYMENT` corretamente:

```ts
.superRefine((data, ctx) => {
  if (data.type === TransactionType.CARD_PAYMENT) {
    if (!data.accountId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe a conta pagadora",
        path: ["accountId"],
      });
    }
    if (!data.cardId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o cartão da fatura",
        path: ["cardId"],
      });
    }
    return;
  }

  if (Boolean(data.accountId) === Boolean(data.cardId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Informe exatamente uma origem: conta ou cartão",
      path: ["accountId"],
    });
  }
})
```

Por quê `superRefine` e não dois `.refine`: precisamos de mensagens por campo (`accountId` vs
`cardId`) e de rodar só um dos dois ramos por `type` — um único `.refine` com path fixo perderia a
granularidade (o form precisa saber qual dos dois campos falhou para focar o erro certo).

### `updateTransactionSchema`

Update é parcial — o comentário existente (linha 51-57) já documenta que a invariante completa só é
avaliada no service contra o estado mesclado. O `.refine` aqui só precisa parar de bloquear
`CARD_PAYMENT` mandando os dois campos no mesmo payload (caso legítimo agora):

```ts
.refine((data) => data.type === TransactionType.CARD_PAYMENT || !(data.accountId && data.cardId), {
  message: "Informe exatamente uma origem: conta ou cartão",
  path: ["accountId"],
})
```

Nota: `data.type` pode vir `undefined` num update que não muda o tipo — nesse caso o refine cai no
ramo XOR de sempre, o que é seguro porque `assertSourceAndCategoryInvariant` no service reavalia
contra o `resultType` mesclado (existing.type quando `input.type` não veio) e é quem decide de
verdade.

---

## 3. Service (`src/modules/transactions/service.ts`)

### `assertSourceAndCategoryInvariant` (linhas 34-53)

Tornar type-aware — hoje assume XOR sempre (linha 40) antes mesmo de checar `CARD_PAYMENT`:

```ts
function assertSourceAndCategoryInvariant(
  type: TransactionType,
  categoryId: string | null,
  accountId: string | null,
  cardId: string | null,
): void {
  if (type === TransactionType.CARD_PAYMENT) {
    if (!accountId || !cardId) {
      throw new InvalidSourceError(
        "Pagamento de fatura exige conta pagadora e cartão da fatura",
        { accountId, cardId },
      );
    }
    if (categoryId) throw new CategoryNotAllowedError();
    return;
  }

  if (Boolean(accountId) === Boolean(cardId)) {
    throw new InvalidSourceError("Informe exatamente uma origem: conta ou cartão", {
      accountId,
      cardId,
    });
  }
  if (!categoryId) throw new CategoryRequiredError();
}
```

Chamada em `createTransaction` (linha 91) e `updateTransaction` (linha 163) não muda — ambas já
passam `type`/`categoryId`/`accountId`/`cardId` resolvidos (merge feito antes, linhas 157-160 no
update). `assertCardOwnership`/`assertAccountOwnership` (linhas 174-175) já disparam para ambos os
IDs quando presentes no payload — nenhuma mudança necessária aí.

### Balanço da conta (`src/modules/accounts/service.ts`) — confirmação, sem mudança de código

- `signedAmount` (linhas 24-34) já trata `CARD_PAYMENT` como saída (`amount.negated()`), agnóstico a
  `cardId`.
- `accountRepository.sumAmountsByType` (`src/modules/accounts/repository.ts:91-111`) agrupa
  `groupBy(by: ["accountId", "type"], where: { accountId: { in: accountIds }, ... })` — **não
  filtra por `cardId`**. Uma `CARD_PAYMENT` com `cardId` preenchido continua contando exatamente
  uma vez no saldo da conta (`accountId`), sem relação com o cartão. Confirmado: nenhum
  double-counting, nenhuma mudança necessária em `accounts/service.ts` ou `repository.ts`.
- Constraint de banco: não há `CHECK` nem índice que proíba `accountId` e `cardId` simultâneos no
  model `Transaction` (`prisma/schema.prisma:368-377`, ambos `String?` soltos) — confirmado também
  pelo fato de `pay-invoice.ts` já persistir os dois há tempo sem erro.

---

## 4. Form UI

### `src/components/forms/new-transaction-form.tsx` — SEM MUDANÇA

Não expõe `CARD_PAYMENT` (`QUICK_TYPES`, linha 33-36) e não deve passar a expor — a decisão já
documentada (linha 61-66) é intencional: pagamento de fatura tem tela própria
(`PayInvoiceModal`) com validação de saldo devedor (`outstandingBalance`, guard de
`PAYMENT_EXCEEDS_BALANCE`) que não faz sentido duplicar no form genérico. Adicionar `CARD_PAYMENT`
aqui seria escopo novo não pedido (YAGNI) — o pedido é consertar a criação/edição que JÁ existe, não
abrir um segundo caminho de criação.

### `src/components/cards/pay-invoice-modal.tsx` — SEM MUDANÇA

Já captura `accountId` (obrigatório, linha 101) com `cardId` fixo vindo da página do cartão
(prop `cardId`, sempre passado). Sempre produz o par completo via `pay-invoice.ts`. Nenhuma
alteração necessária.

### `src/components/transactions/edit-transaction-modal.tsx` — MUDANÇA NECESSÁRIA (é o bug real)

Hoje, para `isCardPayment` (linha 54), o form ainda usa o campo único `origin`
(`referenceData.originOptions`, linha 222-235) — que só permite conta OU cartão, nunca os dois, e
carrega errado no populate (ver seção 1). Precisa de dois campos dedicados quando
`isCardPayment === true`:

- **Conta pagadora** — `EntitySelect` só com contas, obrigatório, pré-preenchido com
  `transaction.accountId`.
- **Cartão da fatura** — `EntitySelect` só com cartões, obrigatório, pré-preenchido com
  `transaction.cardId`.
- Esconder/substituir o campo `origin` combinado (que continua servindo para EXPENSE/INCOME).

Pré-requisito de dados: `useTransactionsReferenceData`
(`src/components/transactions/use-transactions-reference-data.ts`) hoje só expõe `originOptions`
(contas+cartões fundidos com prefixo `account:`/`card:`, linhas 67-70). Adicionar dois campos novos
ao retorno — `accountOptions`/`cardOptions` com `value` = id puro (sem prefixo) — reaproveitando os
mesmos `accounts`/`cards` já buscados em `fetchTransactionsReferenceData` (sem fetch novo):

```ts
accountOptions: accounts.map((account) => ({ value: account.id, label: account.name })),
cardOptions: cards.map((card) => ({ value: card.id, label: card.name })),
```

Mudanças em `edit-transaction-modal.tsx`:

- Novo state `cardPaymentAccountId`/`cardPaymentCardId` (ou reaproveitar `origin`/um novo par),
  populados no bloco de sync (linha 78-95) diretamente de `transaction.accountId`/`transaction.cardId`
  quando `isCardPayment`, em vez de derivar `origin` combinado.
- Validação em `handleSubmit` (linha 106-112): quando `isCardPayment`, exigir os dois IDs
  (`errors.accountId`/`errors.cardId` em vez de `errors.origin`).
- Submit (linha 117-127): quando `isCardPayment`, enviar
  `accountId: cardPaymentAccountId, cardId: cardPaymentCardId` diretamente — não passar pelo split
  de `origin`.
- JSX (linha 222-235): renderizar condicionalmente os dois `EntitySelect` novos no lugar do
  `origin` único quando `isCardPayment`.

### Outras superfícies (sem mudança)

- `transaction-filter-options.tsx`, `transaction-columns.tsx`, `transaction-detail-hero.tsx`,
  badges — só leitura/exibição, não criam nem editam `accountId`/`cardId`. Sem mudança.

---

## 5. Telegram — achado (sem mudança de código)

O bot **não consegue criar `CARD_PAYMENT`** hoje:

- `TelegramTransactionType` (`src/modules/telegram/types.ts:1`) = `"INCOME" | "EXPENSE"` — o tipo
  usado em todo o fluxo de criação (`draft.ts:40,133,147`, `create.ts:16,63`) não inclui
  `CARD_PAYMENT` no nível de tipo, então nenhum caminho de `register`/draft/confirmação consegue
  produzir essa transação.
- `card_invoice` é um `queryType` dentro do intent `query` (`src/modules/telegram/query.ts:53-91,
  112,162`) — só leitura (`kind: "card_invoice"`, `card_not_found`, `card_ambiguous`,
  `card_no_invoice`), nunca cria transação.
- Intents possíveis (`handlers.ts:171,394`): `query | invest | ask | create_category | register |
  unknown`. Nenhum deles cria `CARD_PAYMENT`.

Conclusão: nenhuma mudança necessária no módulo `telegram/`.

---

## 6. Backfill

6 linhas `CARD_PAYMENT` com `accountId` preenchido (todas pagas da conta "Nubank") e `cardId IS
NULL`, mapeamento confirmado pelo dono do produto:

| transactionId | valor | cardId destino | card |
|---|---|---|---|
| `cmra3bp9n000pe8lwrm7hm792` | R$3.786,50 | `cmra15cyr000004l1oxjgfia5` | Nubank Pessoal |
| `cmra3bpdw000qe8lwon4ncecs` | R$1.683,47 | `cmra1ps8s000004js9nvxdp8f` | Porto Bank |
| `cmra3bvke0026e8lw3614l7ty` | R$104,41 | `cmra1ir7l000004l2so48uk0q` | Nubank MEI |
| `cmra3bvbw0024e8lwuxa561ii` | R$376,69 | `cmra34a7c000004l7vb0b0e8t` | Mercado Pago |
| `cmra3buuy0020e8lw23pwx5pa` | R$3.449,24 | `cmra15cyr000004l1oxjgfia5` | Nubank Pessoal |
| `cmracjf8c000004jxu3isbe75` | R$2.252,72 | `cmra1ps8s000004js9nvxdp8f` | Porto Bank |

UPDATE idempotente (só toca linhas com `cardId IS NULL` — reexecutar não tem efeito colateral):

```sql
UPDATE "Transaction" SET "cardId" = 'cmra15cyr000004l1oxjgfia5'
  WHERE id = 'cmra3bp9n000pe8lwrm7hm792' AND "cardId" IS NULL;

UPDATE "Transaction" SET "cardId" = 'cmra1ps8s000004js9nvxdp8f'
  WHERE id = 'cmra3bpdw000qe8lwon4ncecs' AND "cardId" IS NULL;

UPDATE "Transaction" SET "cardId" = 'cmra1ir7l000004l2so48uk0q'
  WHERE id = 'cmra3bvke0026e8lw3614l7ty' AND "cardId" IS NULL;

UPDATE "Transaction" SET "cardId" = 'cmra34a7c000004l7vb0b0e8t'
  WHERE id = 'cmra3bvbw0024e8lwuxa561ii' AND "cardId" IS NULL;

UPDATE "Transaction" SET "cardId" = 'cmra15cyr000004l1oxjgfia5'
  WHERE id = 'cmra3buuy0020e8lw23pwx5pa' AND "cardId" IS NULL;

UPDATE "Transaction" SET "cardId" = 'cmra1ps8s000004js9nvxdp8f'
  WHERE id = 'cmracjf8c000004jxu3isbe75' AND "cardId" IS NULL;
```

Ou em lote único (mesma semântica, um statement):

```sql
UPDATE "Transaction" AS t SET "cardId" = v.card_id
FROM (VALUES
  ('cmra3bp9n000pe8lwrm7hm792', 'cmra15cyr000004l1oxjgfia5'),
  ('cmra3bpdw000qe8lwon4ncecs', 'cmra1ps8s000004js9nvxdp8f'),
  ('cmra3bvke0026e8lw3614l7ty', 'cmra1ir7l000004l2so48uk0q'),
  ('cmra3bvbw0024e8lwuxa561ii', 'cmra34a7c000004l7vb0b0e8t'),
  ('cmra3buuy0020e8lw23pwx5pa', 'cmra15cyr000004l1oxjgfia5'),
  ('cmracjf8c000004jxu3isbe75', 'cmra1ps8s000004js9nvxdp8f')
) AS v(transaction_id, card_id)
WHERE t.id = v.transaction_id AND t."cardId" IS NULL;
```

Pós-backfill, verificação (deve retornar 0 linhas):

```sql
SELECT id FROM "Transaction"
WHERE type = 'CARD_PAYMENT' AND "deletedAt" IS NULL
  AND ("accountId" IS NULL OR "cardId" IS NULL);
```

`accountId` das 6 linhas já está setado (Nubank) — o backfill só preenche `cardId`, deixando as
linhas com os dois campos, igual ao formato produzido por `pay-invoice.ts`. Não afeta saldo da
conta (`cardId` não entra em `signedAmount`/`sumAmountsByType`, seção 3) — o backfill é
estritamente aditivo do ponto de vista de saldo, só passa a fazer essas 6 linhas aparecerem
corretamente na fatura de cada cartão.

Execução: via Supabase MCP (`mcp__supabase__execute_sql` ou `apply_migration` se preferir deixar
rastro de migration — como é dado de produção pontual, um `execute_sql` direto é suficiente, sem
necessidade de migration versionada).

---

## 7. Finalização da feature de cartão (fatura paga/atrasada)

`computeLastInvoiceFields`/`lastClosedInvoiceStatus` (`src/modules/cards/service.ts:206-274`) e as
queries de suporte (`src/modules/cards/repository.ts:249-293`
`findCardPaymentsInRange`/`listCardPaymentsForCards`) já filtram por `cardId` diretamente na query
Prisma (`where: { cardId, type: CARD_PAYMENT, ... }` / `cardId: { in: cardIds }`). Uma vez que:

1. O schema/service force `cardId` em toda `CARD_PAYMENT` nova (seção 2-3), e
2. O backfill preencher as 6 órfãs (seção 6),

essas queries passam a enxergar 100% dos pagamentos automaticamente — **nenhuma mudança de código
necessária na feature de cartão**, ela já foi escrita assumindo `cardId` confiável (o design doc
`docs/superpowers/specs/2026-07-13-cartao-vencimento-fatura-status-design.md` já registra isso como
premissa).

Edge case aceitável, sem mudança: uma `CARD_PAYMENT` datada **fora** da janela
`[closedCycle.periodEnd, openCycle.periodEnd)` (ex.: pagamento adiantado ou muito atrasado, fora do
ciclo esperado) não é atribuída ao `paidAmount` daquela fatura — é uma heurística de janela de data
documentada, não um bug (mesmo racional de `docs/22-CREDIT_CARDS.md`: não existe coluna que ligue
`CARD_PAYMENT` a um invoice/período). Fora de escopo desta mudança.

---

## 8. Plano de implementação (ordem sugerida)

1. `src/modules/transactions/schemas.ts` — `superRefine` em `createTransactionSchema`, `refine`
   type-aware em `updateTransactionSchema` (seção 2).
2. `src/modules/transactions/service.ts` — `assertSourceAndCategoryInvariant` type-aware (seção 3).
3. Testes de schema + service (seção 9) — TDD: escrever antes do passo 4 idealmente, mas como 1-2 já
   são o core, rodar testes logo em seguida para travar o comportamento.
4. `src/components/transactions/use-transactions-reference-data.ts` — expor
   `accountOptions`/`cardOptions` plain-id (seção 4).
5. `src/components/transactions/edit-transaction-modal.tsx` — dois selects dedicados para
   `isCardPayment` (seção 4).
6. Backfill via Supabase MCP (seção 6) — pode rodar em paralelo aos passos 1-5, é independente do
   código (mas só faz sentido fechar a tarefa depois que 1-2 impedem recorrência).
7. Verificação final: query de checagem (seção 6) retorna 0 linhas; smoke test manual de
   `PayInvoiceModal` (pagamento novo continua ok) e de `EditTransactionModal` (editar uma
   `CARD_PAYMENT` existente preserva `cardId`).

Nenhuma mudança em `src/modules/cards/pay-invoice.ts`, `src/modules/cards/service.ts`,
`src/modules/cards/repository.ts`, `src/components/cards/pay-invoice-modal.tsx`,
`src/components/forms/new-transaction-form.tsx`, ou qualquer arquivo de `src/modules/telegram/`.

---

## 9. Plano de testes

### Schema (`src/modules/transactions/schemas.test.ts` — criar se não existir)

- `createTransactionSchema`:
  - `CARD_PAYMENT` com `accountId` + `cardId` + sem `categoryId` → válido.
  - `CARD_PAYMENT` só com `accountId` (sem `cardId`) → inválido, issue em `path: ["cardId"]`.
  - `CARD_PAYMENT` só com `cardId` (sem `accountId`) → inválido, issue em `path: ["accountId"]`.
  - `CARD_PAYMENT` com `categoryId` preenchido → inválido (regra existente, não regressar).
  - `EXPENSE`/`INCOME` com só `accountId` → válido (XOR preservado).
  - `EXPENSE`/`INCOME` com só `cardId` → válido (XOR preservado).
  - `EXPENSE`/`INCOME` com os dois → inválido (XOR preservado).
  - `EXPENSE`/`INCOME` sem nenhum → inválido (XOR preservado).
- `updateTransactionSchema`:
  - `{ type: CARD_PAYMENT, accountId, cardId }` no mesmo payload → válido (não bloqueia mais).
  - `{ type: EXPENSE, accountId, cardId }` no mesmo payload → inválido (XOR ainda vale quando type
    não é CARD_PAYMENT).
  - Payload sem `type` (mantém o existente) com os dois campos preenchidos → ainda bloqueado pelo
    refine do schema (comportamento atual preservado — a invariante fina fica no service).

### Service (`src/modules/transactions/service.test.ts` — checar se já existe suite; se não, criar)

- `createTransaction` com `type=CARD_PAYMENT`, `accountId`+`cardId` válidos → cria com sucesso,
  chama `assertAccountOwnership` E `assertCardOwnership` (não só um dos dois).
- `createTransaction` com `type=CARD_PAYMENT` e só `accountId` → lança `InvalidSourceError` (esse
  caso teoricamente já barrado no schema, mas o service é a fonte de verdade — vale um teste direto
  chamando o service com input que bypassa o schema, simulando chamada direta).
- `updateTransaction`: transação existente `CARD_PAYMENT` com `accountId`+`cardId`, update que só
  muda `amount`/`date` (não toca em `accountId`/`cardId`) → estado mesclado mantém os dois, não
  lança. **Este é o teste que trava a regressão do bug real encontrado** (edit sem tocar
  origem não deve nunca zerar `cardId`).
  - Notar que isso testa o SERVICE — o teste de UI (abaixo) cobre o form não mandar
    `cardId: null` nesse caso.
- `updateTransaction`: tentar setar `cardId: null` explicitamente numa `CARD_PAYMENT` existente
  (sem tocar `accountId`) → lança `InvalidSourceError` (estado mesclado: accountId presente, cardId
  null → falha a checagem `!accountId || !cardId`).
- `updateTransaction`: mudar `type` de `EXPENSE` para `CARD_PAYMENT` sem enviar o par completo →
  lança `InvalidSourceError` (regressão a evitar: conversão de tipo não pode silenciosamente ficar
  com um XOR antigo).

### Form (`edit-transaction-modal`, manual ou RTL se houver suite de componente)

- Abrir modal de edição numa `CARD_PAYMENT` existente (`accountId`+`cardId` setados) → os dois
  selects (conta + cartão) aparecem pré-preenchidos com os valores corretos.
- Salvar sem tocar em nada → payload enviado tem `accountId` e `cardId` iguais aos originais (não
  `null`).
- Tentar salvar com um dos dois em branco → erro de validação client-side, sem chamar a action.

Não há teste de Telegram a escrever (seção 5 confirma que o bot não cria `CARD_PAYMENT`).

---

## 10. Premissas / riscos

- **Premissa**: os 6 IDs de cartão/transação informados pelo dono existem e pertencem ao mesmo
  `userId` das 6 transações — não validado nesta investigação (não faz parte do escopo "spec only",
  mas o `UPDATE` roda com `WHERE id = ... AND "cardId" IS NULL`, sem `userId` — se o executor
  (Supabase MCP) rodar direto no Postgres sem RLS por `userId`, vale conferir 1x que os cardId
  batem com o dono das transações antes de rodar, evitando cross-user data corruption. Sugestão:
  rodar antes um `SELECT t."userId" AS tx_user, c."userId" AS card_user FROM "Transaction" t JOIN
  "Card" c ON c.id = <cardId> WHERE t.id = <transactionId>` por linha e confirmar `tx_user =
  card_user`.
- **Risco baixo**: tornar `createTransactionSchema` apto a criar `CARD_PAYMENT` com o par completo
  não abre uma superfície de ataque nova — já era possível (só que com um dos dois campos, o que é
  pior). Ownership de `accountId`/`cardId` continua validado em `assertAccountOwnership`/
  `assertCardOwnership` (service.ts linhas 68-76), escopado a `userId`.
- **Fora de escopo**: nenhuma migration de schema Prisma — `accountId`/`cardId` já são `String?`
  soltos, sem `CHECK` constraint a adicionar/remover.
- **Fora de escopo**: qualquer normalização retroativa além dos 6 IDs listados — se existirem outras
  `CARD_PAYMENT` órfãs além dessas 6 (não confirmado pelo dono), este backfill não as cobre; a
  query de verificação (seção 6) serve para descobrir se sobrou alguma.
