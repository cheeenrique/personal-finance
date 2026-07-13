# Vencimento + status de pagamento da fatura em `/cards` — design

Data: 2026-07-13
Status: investigação concluída — aguardando decisão do dono sobre as premissas antes de virar plano de implementação.

## Contexto / requisito

Pedido do dono, em `/cards`, por cartão (grid de listagem, não o detalhe):

1. Mostrar o vencimento da fatura **do mês atual**.
2. Mostrar se essa fatura está **paga** ou **não**.
3. Se **não paga** e hoje já passou do vencimento → alerta **vermelho** "fatura atrasada".

Só se aplica a cartão `CREDIT` (docs/22-CREDIT_CARDS.md não cobre fatura/vencimento pra `CardType.MEAL` — `prisma/schema.prisma:211`).

## Modelo de domínio (o que existe hoje)

- `Card.closingDay`/`Card.dueDay` (`prisma/schema.prisma:219-220`): dias do mês (1-31), interpretados em America/Sao_Paulo. Podem mudar ao longo do tempo — cada mudança grava um `CardCycle` novo (`effectiveFrom`), nunca reescreve o passado (`src/modules/cards/repository.ts:120-169`).
- `CardInvoice` (`prisma/schema.prisma:286-302`): fatura FECHADA e **armazenada**, com `isPaid` (default `true`), `dueDate`, `year`/`month`, `total`. Pensada pra extrato **importado** (docs/22, comentário do model). **Achado importante**: não existe NENHUM `prisma.cardInvoice.create/update/upsert` em `src/**` fora dos comentários gerados pelo Prisma Client (`rg cardInvoice\.(create|upsert|update)` só bate em `src/generated/prisma/models/CardInvoice.ts`, que é doc do client, não chamada real). Ou seja, hoje **nenhuma fatura é gravada nessa tabela** — o campo `isPaid` real existe no schema mas está morto em produção até o import de fatura (spec `2026-07-11-import-fatura-cartao-credito-design.md`) ser implementado. `cardRepository.listInvoices` (`repository.ts:310-315`) só lê.
- `cycle.ts` (`src/modules/cards/cycle.ts`): funções puras, sem I/O.
  - `cycleContaining(cycles, fallback, refDate)` (linha 150): ciclo que **contém** `refDate` — usado com `refDate = new Date()` (agora real, nunca `nowInSaoPaulo()` — ver comentário em `service.ts:118-127`).
  - `cycleForClosingMonth(cycles, fallback, year, month)` (linha 194): ciclo de um fechamento específico (passado ou futuro), por mês/ano do **fechamento**.
  - `dueDateForClosing` (linha 112): se `dueDay > closingDay`, vencimento cai no MESMO mês do fechamento; senão, no mês SEGUINTE.
- `cardService.currentInvoice` (`service.ts:129-135`) e `listWithSummary` (`service.ts:214-290`, campo `invoiceDueDate`/`currentInvoiceTotal`, `CardWithSummary.invoiceDueDate` em `types.ts:55`) usam **sempre** `cycleContaining(now)` — ou seja, o ciclo **aberto/em formação**, nunca o que acabou de fechar.

### Achado central — `currentInvoice`/`invoiceDueDate` NÃO é "a fatura que devo pagar agora"

`cycleContaining` só avança de ciclo quando `refDate >= periodEnd` (o **fechamento**), não quando passa o vencimento. Exemplo: fecha dia 10, vence dia 20.
- Em 5/jul (antes do fechamento): ciclo aberto = `[10/jun, 10/jul)`, `dueDate = 20/jul`. Fatura ainda em formação.
- Em 11/jul (1 dia depois do fechamento): `cycleContaining` já **rolou** pro próximo ciclo `[10/jul, 10/ago)`, `dueDate = 20/ago`. A fatura que **fechou** em 10/jul (a que o usuário precisa pagar até 20/jul) **desapareceu** de `currentInvoice`/`invoiceDueDate` — ela só existe no lado "passado" (`invoiceFor`/`cycleForClosingMonth`, consumido em `src/app/(app)/cards/[id]/page.tsx:77-95` para o histórico).

Consequência direta pro requisito: "vencimento do mês atual" e "está paga" só fazem sentido pra fatura que **já fechou** e está aguardando pagamento — não pra `invoiceDueDate`/`currentInvoiceTotal` que hoje aparecem em `CardWithSummary`. Usar esses campos como estão mostraria, na maior parte do mês, o vencimento da fatura **seguinte** (ainda em formação, sem sentido de "atrasada").

**Serviço novo necessário**: "última fatura fechada" — o ciclo imediatamente ANTERIOR ao ciclo aberto. Cálculo puro e barato reaproveitando `cycle.ts` sem escrever data-math nova: chamar `cycleContaining(cycles, fallback, new Date(openCycle.periodStart.getTime() - 1))` (1ms antes do início do ciclo aberto cai, por definição, dentro do ciclo anterior).

## Decisão "fatura paga" — a peça chave

`CARD_PAYMENT` (docs/22, "Pagamento da fatura"; `pay-invoice.ts:79-91`) grava `cardId` + `accountId`, mas **não tem nenhum vínculo com um invoice/período específico** — nem `invoiceId`, nem `year`/`month`. `outstandingBalance` (`service.ts:163-168`) é Σ `EXPENSE` (todas, inclusive parcelas futuras que já reservam limite, docs/22) − Σ `CARD_PAYMENT` (todas), **histórico completo, não por ciclo**. Por isso **não dá pra usar `outstandingBalance <= 0` como "fatura do mês paga"**: um cartão com parcelamento em andamento nunca zera o saldo devedor total mesmo pagando a fatura do mês em dia (as parcelas futuras continuam compondo o saldo).

Já existe um precedente no código pra "fatura paga" — e ele **não serve** pra este requisito: `serializePastInvoice` (`src/components/cards/serialize.ts:63-72`) marca `isPaid = invoice.dueDate < startOfTodaySP()`, isto é, "já venceu = presumo pago". Isso é uma heurística cosmética pro histórico (`InvoiceHistoryList`, badge "Paga" — `invoice-history-list.tsx:39-43`), onde nunca é acionável. Se reaproveitássemos essa heurística aqui, **nenhuma fatura jamais apareceria como atrasada** (o próprio vencimento passado já a marcaria "paga") — o oposto do que o dono pediu.

### Definição proposta

Fatura da última fechada (a "fatura do mês atual" pro requisito) está **paga** quando:

```
paidAmount = Σ amount de Transaction
             WHERE cardId = X AND type = CARD_PAYMENT AND isPaid = true
               AND date >= invoice.periodEnd (fechamento desta fatura)
               AND date <  openCycle.periodEnd (fechamento do PRÓXIMO ciclo)

isPaid = paidAmount >= invoice.total
```

Janela `[periodEnd da fatura, periodEnd do próximo ciclo)` — atribui por **data do pagamento**, não por valor exato, e evita que um pagamento adiantado da fatura seguinte seja contado duas vezes (fica de fora da janela da fatura atual porque só entra depois que o ciclo dela mesma fechar... na prática, o caso comum é o pagamento cair exatamente dentro da janela, entre o fechamento e o vencimento).

**PREMISSA A CONFIRMAR COM O DONO (1)**: sem uma coluna que ligue `CARD_PAYMENT` a um invoice/período, esta atribuição por janela de data é uma heurística. Ela cobre o fluxo normal (usuário paga a fatura perto do vencimento), mas quebra se: (a) o usuário atrasar o pagamento pra depois que o PRÓXIMO ciclo já fechou (paga em 15/set uma fatura que fechou em 10/jul) — nesse caso o pagamento cai fora da janela e a fatura continua marcada como não paga mesmo tendo sido quitada; (b) o usuário pagar adiantado, antes mesmo do fechamento — Regra 1 de negócio (docs/22, "cartão nunca pode ter saldo positivo") deveria impedir isso via `PaymentExceedsBalanceError`, mas só se o valor exceder o devedor total, não por período. Alternativa mais robusta = adicionar `CardPayment.invoiceId` (ou `referenceYear`/`referenceMonth`) no schema — fora do escopo deste ciclo (mudança de schema), mas fica registrado como fast-follow se o dono confirmar que atraso multi-ciclo é um caso real.

**PREMISSA A CONFIRMAR COM O DONO (2)**: pagamento **parcial** (`0 < paidAmount < total`) — a proposta trata como **"não paga"** pro badge binário pedido (paga/não paga) e pro alerta de atraso (se already overdue, mostra atrasada mesmo com pagamento parcial, já que ainda resta saldo). Mostrar "parcialmente paga" como um terceiro estado é enhancement natural (a `Invoice`/serialização já teria `paidAmount` calculado), mas não foi pedido explicitamente — fica como extensão opcional, não faz parte do binário mínimo.

**PREMISSA A CONFIRMAR COM O DONO (3)**: fatura com `total = 0` (cartão sem compras no ciclo, ex.: cartão novo ou mês sem uso) — proposta: tratar como paga trivialmente (não faz sentido "dever" alertar por R$ 0) e **não exibir** due-date/badge/alerta pra esse cartão (mesmo padrão de "sem fatura" — ver Edge cases).

## Lógica de vencimento/atraso — onde vive

100% em `src/modules/cards/` (regra de ouro, `docs/99-CLAUDE.md`). Nova função pura em `cycle.ts` ou uma nova função de serviço em `service.ts` (não em componente/Server Action):

```ts
// src/modules/cards/cycle.ts (extensão)
/**
 * Ciclo imediatamente ANTERIOR ao ciclo aberto — a fatura que JÁ FECHOU e
 * está aguardando pagamento (distinto de `cycleContaining(now)`, que é o
 * ciclo em formação — ver JSDoc de "achado central" no design doc).
 */
export function previousClosedCycle(cycles: CycleRule[], fallback: CycleFallback, openCycle: CardCycle): CardCycle {
  return cycleContaining(cycles, fallback, new Date(openCycle.periodStart.getTime() - 1));
}
```

```ts
// src/modules/cards/service.ts (nova função de serviço)
export type InvoiceStatus = {
  invoice: Invoice;          // periodStart/periodEnd/dueDate/total/items da última fatura fechada
  paidAmount: Money;
  isPaid: boolean;
  isOverdue: boolean;        // isPaid=false && hoje (SP, dia civil) > dueDate (dia civil)
};

async function lastClosedInvoiceStatus(userId: string, cardId: string, refDate: Date = new Date()): Promise<InvoiceStatus | null>
```

- Guard de "cartão sem fatura anterior ainda" (ver Edge cases): se `openCycle.periodStart <= card.createdAt`, retorna `null` (cartão não completou nenhum ciclo desde que foi criado).
- Comparação de "hoje > vencimento" por **dia civil** em America/Sao_Paulo, reaproveitando `calendarPartsSP`/`startOfDaySP` (`src/lib/date/calendar-sp.ts:17-19,31-33`) — mesmo padrão já usado em `serializePastInvoice` (`serialize.ts:51-54`), só que aqui vira `isOverdue` (não `isPaid`). `dueDate` já é meia-noite SP (`cycle.ts` `saoPauloMidnight`), então "atrasada" = `startOfDaySP(hoje) > dueDate` (estritamente depois — no próprio dia do vencimento ainda NÃO é atraso, conforme pedido: "hoje é dia == vencimento" não dispara o alerta).
- Nunca usar `nowInSaoPaulo()` como o instante de referência do ciclo (mesma ressalva já documentada em `service.ts:118-127` pra `currentInvoice`) — usar `new Date()` real pra achar o ciclo, e só converter pra calendário SP na hora de comparar o DIA do vencimento.

## Mudanças de service/repository

1. **`src/modules/cards/cycle.ts`**: adicionar `previousClosedCycle` (pura, ~10 linhas, reaproveita `cycleContaining`). Sem mudança de assinatura das funções existentes.
2. **`src/modules/cards/repository.ts`**: nova função `sumCardPaymentsInRange(userId, cardId, range: {gte, lt}, db?)` — mesmo padrão de `findExpensesInRange` (linha 190-214), mas filtrando `type: CARD_PAYMENT` em vez de `EXPENSE`. Reaproveita o índice existente de `Transaction` por `cardId`+`date` (mesma query shape de `findExpensesInRange`).
3. **`src/modules/cards/service.ts`**:
   - Nova função `lastClosedInvoiceStatus` (assinatura acima) — chama `getCard`, `assertCreditCard`, resolve `openCycle` via `cycleContaining`, `previousClosedCycle` pra achar a fatura fechada, `buildInvoice` (já existe, linha 92-105) pra montar a `Invoice`, soma pagamentos via `sumCardPaymentsInRange`, aplica a regra de `isPaid`/`isOverdue`.
   - Estender **`listWithSummary`** (linha 214-290) pra incluir, no branch `CREDIT`, os 3 campos novos direto no retorno (`CardWithSummary`): `lastInvoiceDueDate: Date | null`, `lastInvoiceIsPaid: boolean | null`, `lastInvoiceIsOverdue: boolean | null` (todos `null` quando não há fatura anterior — cartão novo — ou quando `card.type === MEAL`). Evita N+1: os dados de `CARD_PAYMENT` já vêm de `sumByCardAndType` (linha 226) só que agregados sem filtro de data — precisa de uma query adicional por lista (`listCardPaymentsForCards`, análoga a `listExpensesForCards`, linha 223-240) pra não fazer 1 query por cartão.
   - Exportar `lastClosedInvoiceStatus` em `cardService` (linha 305-318) só se o detalhe do cartão (`/cards/[id]`) também for atualizado a reusar esse status em vez do botão "Pagar fatura" atual baseado em `outstandingBalance` global — **fora do escopo pedido** (o pedido é só a listagem `/cards`), mas útil deixar exportado pra não duplicar lógica se o dono quiser aplicar o mesmo badge no detalhe depois.
4. **`src/modules/cards/types.ts`**: estender `CardWithSummary` (linha 51-62) com os 3 campos novos documentados no JSDoc do tipo (mesmo padrão dos campos MEAL: `null` quando não aplicável).
5. **`src/components/cards/types.ts`** (`CardSummaryView`, linha 13-41) e **`src/components/cards/serialize.ts`** (`serializeCardSummary`, linha 7-31): propagar os 3 campos serializados (`Date → ISO string`, `Money → string` não se aplica aqui pois são booleans/data).

Nenhuma mudança de schema Prisma é necessária pra este escopo (usa só `Transaction` + `Card`/`CardCycle` já existentes).

## Mudanças de UI

Escopo: só o **grid de listagem** `/cards` (`src/app/(app)/cards/page.tsx` → `CardsGrid` → `CardTile`), conforme pedido do dono (não o detalhe `/cards/[id]`, embora a decisão de service acima já deixe isso plugável depois).

- **`src/components/cards/card-tile.tsx`** (hoje: face do cartão + barra de uso + rodapé "Fatura atual / Disponível", linhas 39-98): adicionar uma faixa entre a barra de progresso e o rodapé (ou dentro do rodapé, como uma 3ª linha) só para `card.type === CREDIT` e quando `lastInvoiceDueDate !== null`:
  - Texto "vence {formatDateShortSaoPaulo(lastInvoiceDueDate)}" (reaproveitar `formatDateShortSaoPaulo`, `src/lib/date/format.ts:16-24`, mesmo padrão usado em `invoice-history-list.tsx:47` mas versão curta pra caber no tile compacto).
  - Badge de status:
    - Paga → chip verde (`bg-success/16 text-success`, mesmo padrão de `invoice-history-list.tsx:40-43`), texto "Paga".
    - Não paga, ainda não vencida → chip âmbar (`bg-warning/14 text-on-warning`, mesmo padrão do chip "vence dia Y" em `invoice-summary-card.tsx:51-54`), texto "Em aberto".
    - Não paga E atrasada (`isOverdue`) → chip **destructive** (`bg-destructive/16 text-on-danger` — regra de tokens do design system, `docs/04-DESIGN_SYSTEM.md:116-123`: `on-danger` pra texto/ícone sobre tint, nunca `text-destructive` cru), texto "Fatura atrasada", ícone `AlertTriangle` (lucide, já usado em `monthly-narrative-card.tsx:36` pro mesmo padrão semântico "atrasado").
  - **Nunca usar vermelho hardcoded** (`#EF4444` ou similar) — sempre a classe utilitária `bg-destructive/16 text-on-danger`, igual ao restante do app (`kpi-card.tsx:25,34`, `financing-import-analyzing.tsx:95-98`).
- Card `MEAL` ou cartão sem fatura anterior (`lastInvoiceDueDate === null`): não renderiza a faixa — comportamento atual do tile, sem regressão.
- **`src/components/cards/types.ts`** (`CardSummaryView`): já coberto acima (dado, não UI).

Nenhum novo componente client-only necessário — é dado estático vindo do Server Component (`CardsPage` → `serializeCardSummary`), igual ao resto do tile.

## Edge cases

| Caso | Comportamento proposto |
|---|---|
| Cartão `MEAL` | Faixa de vencimento/status nunca aparece (`lastInvoiceDueDate = null` sempre, `assertCreditCard`-style guard no service) |
| Cartão sem `dueDay` configurado | Não existe no schema — `dueDay` é `Int` `NOT NULL` (`prisma/schema.prisma:220`), sempre preenchido na criação. Não é um estado alcançável para `CREDIT`. |
| Cartão criado neste ciclo, nunca fechou uma fatura | `previousClosedCycle` cairia num período anterior à criação do cartão — guard explícito: se `openCycle.periodStart <= card.createdAt`, retorna `null` (sem due-date/badge, mesmo tratamento de MEAL) |
| Última fatura fechada com `total = 0` (sem compras no ciclo) | Trivialmente "paga" (nada a dever) — `isPaid = true`, mas a proposta é **não exibir** a faixa (ver Premissa 3) pra não poluir o tile com "Paga · R$ 0" |
| Fatura paga adiantada (antes do vencimento) | `isPaid = true` → chip verde, nunca overdue, independente da data |
| Hoje == dia do vencimento | NÃO é atraso ainda (comparação estrita `>`, não `>=`) — chip "Em aberto" (âmbar), não vermelho |
| Pagamento parcial (`0 < paidAmount < total`) | Tratado como "não paga" (binário) — ver Premissa 2. Se `isOverdue`, mostra vermelho mesmo assim (ainda resta saldo da fatura) |
| Pagamento feito fora da janela `[periodEnd, próximo periodEnd)` (atraso multi-ciclo) | Heurística falha — fatura pode ficar marcada como "não paga"/"atrasada" mesmo já quitada. Ver Premissa 1 (limitação aceita neste escopo) |
| Cartão MEAL misturado com CREDIT na mesma listagem | Grid já lida com isso hoje via `card.type` (branch em `card-tile.tsx:28-37`) — só estende o mesmo padrão |

## Plano de testes

Novo arquivo `src/modules/cards/cycle.test.ts` (módulo hoje **sem nenhum teste**, apesar do próprio JSDoc de `cycle.ts:9-11` dizer que "merece ser testável isoladamente" — este trabalho é a primeira cobertura real):

- `previousClosedCycle`: ciclo anterior calculado corretamente pra fechamento padrão (dueDay > closingDay e dueDay <= closingDay, os dois ramos de `dueDateForClosing`); comportamento estável através de uma troca de `CardCycle` no meio do histórico (reaproveita os cenários de `cycleContaining` combinando `cycles` não vazio).

Novo arquivo `src/modules/cards/service.test.ts` (ou seção nova se já existir — não existe hoje) pra `lastClosedInvoiceStatus`/lógica de `isPaid`/`isOverdue` — mockando `prisma`/repository (mesmo padrão de outros `service.test.ts` do repo, ex. `src/modules/imports/service.test.ts`, testando função pura extraída em vez do service inteiro sempre que possível):

- Extrair a regra `isPaid`/`isOverdue` pra uma função pura testável sem mock de banco, ex. `evaluateInvoiceStatus({ total, paidAmount, dueDate, today }): { isPaid, isOverdue }` em `cycle.ts` ou um novo `invoice-status.ts` — isola a regra de negócio dos I/O, alinhado com `~/.claude/rules/01-solid.md` (SRP) e o padrão já usado em `cycle.ts` (funções puras, I/O fora):
  - `paidAmount >= total` → `isPaid = true`, `isOverdue = false` (mesmo com `today > dueDate`).
  - `paidAmount < total` e `today` = dia do vencimento → `isPaid = false`, `isOverdue = false`.
  - `paidAmount < total` e `today` = 1 dia depois do vencimento → `isPaid = false`, `isOverdue = true`.
  - `paidAmount < total` e `today` antes do vencimento → `isPaid = false`, `isOverdue = false`.
  - `total = 0` → `isPaid = true` (trivial).
  - `paidAmount` parcial (`0 < paidAmount < total`) → `isPaid = false` (documentar a decisão da Premissa 2 no teste).
- `lastClosedInvoiceStatus` (com repository mockado): cartão sem ciclo anterior (recém-criado) → `null`; soma de `CARD_PAYMENT` fora da janela não conta; soma dentro da janela conta mesmo com múltiplos pagamentos (parcelas de pagamento).

Sem teste E2E/Playwright necessário pro escopo backend — se a UI for coberta, snapshot/RTL do `CardTile` pros 3 estados de badge (verde/âmbar/vermelho) seria o equivalente de frontend, mas não é padrão observado hoje neste repo para componentes de tile (nenhum `.test.tsx` encontrado em `src/components/cards/`) — manter consistência e não introduzir um padrão de teste novo sem necessidade (YAGNI).

## Riscos / premissas em aberto

1. **[Já destacado acima] Atribuição de `CARD_PAYMENT` à fatura por janela de data é heurística, não um vínculo real.** Risco: atraso multi-ciclo (usuário paga fora da janela) mantém o alerta vermelho mesmo após pagar. Mitigação de schema (`invoiceId`/`referenceYear+referenceMonth` em `CARD_PAYMENT`) é a solução definitiva, mas é mudança de schema fora deste escopo — decidir com o dono se vale a pena adiantar.
2. **[Já destacado acima] Pagamento parcial vira "não paga" binário** — sem terceiro estado "parcialmente paga" a não ser que o dono peça.
3. **[Já destacado acima] Fatura com total R$ 0 não exibe a faixa** — alternativa seria exibir "Sem fatura este mês", mas nada foi pedido; manter simples (YAGNI) a menos que o dono queira o texto explícito.
4. **Escopo da UI**: só grid `/cards` (`CardTile`) foi coberto, não o detalhe `/cards/[id]` (`InvoiceSummaryCard`), que hoje mostra "vence dia N" fixo (dia do mês, não a data completa da fatura fechada) e o botão "Pagar fatura" contra o saldo devedor GLOBAL, não contra a fatura específica — mesma ambiguidade do achado central, só que não fazia parte do pedido original. Vale uma spec futura pra alinhar as duas telas (hoje ficariam com semânticas diferentes de "vencimento": listagem = fatura fechada aguardando pagamento; detalhe = ciclo aberto em formação).
5. **`CardInvoice.isPaid` (import de extrato) e a heurística nova coexistem sem se falar**: quando o import de fatura (spec `2026-07-11-import-fatura-cartao-credito-design.md`) for implementado e passar a gravar `CardInvoice` de verdade, o dono pode querer que a listagem `/cards` priorize o `isPaid` REAL da `CardInvoice` (quando existir) em vez da heurística por `CARD_PAYMENT`+janela — igual ao padrão já usado no detalhe (`page.tsx:70-95`, prioriza `storedInvoices` sobre o cálculo). Não é um bloqueio hoje (nenhuma `CardInvoice` é gravada em produção), mas é dívida a prever quando o import entrar.
