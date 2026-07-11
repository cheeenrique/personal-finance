# Camada de "Entender" — Design Spec

Data: 2026-07-11. Objetivo: virar o app de "digitador automático com IA" em
"facilitador que ajuda o user a **entender** as finanças". Toda IA hoje é input
(parse fatura/foto/voz/texto). Falta a camada de output/insight. Tudo aqui é
**compute sobre dados existentes**, exceto Metas (1 tabela nova). Zero mudança no
ledger (`Transaction` continua single source of truth).

Regra de ouro do projeto: lógica de domínio só em `src/modules/`. Server
Actions/Route Handlers só delegam. Server Components leem service direto (sem
action). Money = `Prisma.Decimal`; converter `.toNumber()` no boundary RSC→client.
`userId` sempre derivado server-side via `auth()`, nunca vem do client.

## Frentes

### 1. Projeção de fluxo — `src/modules/projections/` (novo)

Compute puro. Saldo projetado dia-a-dia 30/60/90d + primeiro dia negativo.

Fontes (recon confirmou storage):
- Parcelas cartão: `Transaction` `installmentPurchaseId != null`, `date > now`,
  `isPaid: true`. Debita fatura/cartão, não conta direto.
- Parcelas loan/financiamento: `Transaction` `loanId != null`, `isPaid: false`,
  `date` na janela. Debita `accountId`.
- Recorrentes: **NÃO materializadas** — só `RecurringTransaction.nextRun`.
  Projetar ocorrências via `nextRun` + `recurring/next-run.ts` `computeNextRun`.
- Saldo inicial: `accountService.totalBalance(userId)`.

Cuidado dupla-contagem: parcelas já são Transactions futuras; recurrences não.
Somar Transactions futuras (excluir `transferId != null`) + projetar recurrences.
Escolher base consistente (cash/conta) — não misturar accrual (cartão) no saldo de
conta. Documentar a base escolhida no service.

Saída (serializável, sem Decimal cru pro client):
```ts
type ProjectionPoint = { date: string; balance: number };  // ISO date
type CashflowProjection = {
  points: ProjectionPoint[];           // diário
  firstNegativeDate: string | null;
  lowestBalance: number;
  horizonDays: number;                 // 30 | 60 | 90
};
```
Service: `projectionService.forecast(userId, horizonDays)`. Sem tabela nova.
Widget: `ChartWrapper` no dashboard (área/linha, marca ponto negativo).

### 2. Score de saúde — `src/modules/insights/score.ts` (novo módulo)

Compute puro, 0-100 + breakdown. Métricas:
- Taxa poupança = net ÷ renda (mês corrente ou média 3m). Base cash
  (`reportService.cashflow`).
- Comprometimento dívida = (parcela mês loan + financiamento + fatura aberta) ÷ renda.
- Colchão = emergency fund (Asset EMERGENCY_FUND) ÷ gasto médio mensal (meses).

Cada métrica → sub-score 0-100 por faixa; peso → score final. Faixa define `tone`
(`success`/`warning`/`danger`) no `KPICard`.
```ts
type ScoreBreakdown = { key: "savings"|"debt"|"cushion"; label: string; value: number; score: number; tone: "success"|"warning"|"danger" };
type HealthScore = { score: number; tone: "success"|"warning"|"danger"; breakdown: ScoreBreakdown[] };
```
Service: `insightsService.healthScore(userId, refDate)`.

### 3. Narrativa mensal IA — `src/modules/insights/narrative.ts`

`extractStructured("document-text", {kind:"text", text}, prompt, SCHEMA, parse)`.
Schema JSON (não Zod): `{ resumo: string, destaques: string[] }`. Validar no `parse`
callback (retornar null → aciona fallback Gemini já embutido; se null final,
exibir estado vazio, sem crash — errors-as-data).

Input: números pré-computados do mês (reports cashflow mês vs mês anterior + top
categorias + deltas). IA **redige ancorada nos números**, não inventa. Base única
(cash) pra evitar bug accrual×cash histórico.

Cache: mês fechado é imutável → cachear por `(userId, year, month)`. On-demand, sem
tabela (memória curta em processo / `unstable_cache` por chave). Mês corrente:
regenera (dados mudam).
```ts
type MonthlyNarrative = { resumo: string; destaques: string[]; month: number; year: number } | null;
```
Service: `insightsService.monthlyNarrative(userId, year, month)`. Widget `SectionCard`.

### 4. Tendências — `src/modules/insights/trends.ts`

Compute puro. `reportService.categoryTotals` nos últimos N meses (3-6). Flag
categoria em alta (crescimento consistente vs média própria). Alimenta narrativa e
vira card.
```ts
type CategoryTrend = { categoryId: string; categoryName: string; current: number; avgPrevious: number; deltaPct: number; rising: boolean };
type TrendsResult = { rising: CategoryTrend[]; window: number };
```
Service: `insightsService.categoryTrends(userId, refDate, months)`.

`insights` módulo: `score.ts` + `narrative.ts` + `trends.ts` + `service.ts` (facade
`insightsService`) + `types.ts`. Sem actions (leitura em Server Component).

### 5. Metas de economia — `src/modules/goals/` (novo) + `/goals` page + schema

Schema (única migration):
```prisma
enum GoalSourceType { MANUAL ACCOUNT ASSET }

model SavingsGoal {
  id                 String        @id @default(cuid())
  userId             String
  name               String
  targetAmount       Decimal       @db.Decimal(12, 2)
  targetDate         DateTime?
  sourceType         GoalSourceType @default(MANUAL)
  sourceAccountId    String?
  sourceAssetId      String?
  currentAmount      Decimal       @db.Decimal(12, 2) @default(0)  // usado só p/ MANUAL
  monthlyContribution Decimal?     @db.Decimal(12, 2)
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
  deletedAt          DateTime?
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  account Account? @relation(fields: [sourceAccountId], references: [id], onDelete: SetNull)
  asset   Asset?   @relation(fields: [sourceAssetId], references: [id], onDelete: SetNull)
  @@index([userId])
}
```
Backrefs em `User` (`savingsGoals SavingsGoal[]`), `Account`, `Asset`.

Progresso (derivado no service):
- MANUAL → `currentAmount`.
- ACCOUNT → saldo da conta linkada (`accountService`).
- ASSET → `currentValue` do asset.

ETA: ritmo = `monthlyContribution` se setado, senão poupança média 3m
(insights/reports). `etaMonths = ceil((target - current) / ritmo)`. Se ritmo ≤ 0 →
ETA null ("ritmo insuficiente"). Se `targetDate` setado → também calcular
`requiredMonthly = (target-current) / mesesAté(targetDate)`.
```ts
type GoalProgress = { goal: SavingsGoal; current: number; target: number; pct: number; etaMonths: number|null; requiredMonthly: number|null };
```
Módulo full scaffold (actions/service/repository/schemas/types/errors) igual `tags`.
Page `/goals` CRUD (Server Component lê `goalService.listWithProgress`; mutations via
actions). Widget progresso no dashboard.

### 6. Detecção recorrência/vazamento — `src/modules/alerts/recurring-suggestion.ts`

Heurística pura (não há FK `recurringTransactionId` — recon confirmou). Agrupa
`Transaction` (`userId`, `deletedAt:null`, EXPENSE, `transferId:null`) por
`(descrição normalizada, valor)` nos últimos N meses; candidato = ≥3 ocorrências
cadência ~mensal. Excluir os que já batem `RecurringTransaction` ativa (match por
campos de negócio: desc+valor+categoria+conta, sem join key).

Emitir Alert `RECURRING_SUGGESTION` (severity INFO). Dedup por assinatura
(`findByDedupKey` com `[{path:["signature"], value}]`) pra cron não spammar. Payload:
`{ signature, description, amount, occurrences, categoryId }`. Wire em
`alertService.runWeekly`. Enum novo `AlertType.RECURRING_SUGGESTION` (additivo).

### 7. Q&A livre Telegram — `src/modules/telegram/` (novo intent `ask`)

- `ai-parser.ts`: adicionar `"ask"` em `TelegramIntent`, no `INTENT_CLASSIFICATION`
  prompt, em `aiResponseSchema` (Zod) e `RESPONSE_SCHEMA` (wire uppercase).
- `handlers.ts` `handleFreeformEntry`: branch `if (intent === "ask")` → novo
  `handleAskEntry(userId, rawText)`.
- `ask.ts` (novo): computa contexto numérico (cashflow mês/mês-anterior via reports,
  top categorias ambos períodos, saldo, score) → monta prompt com números → IA
  **redige resposta ancorada** (pt-BR curto). Reusa `resolvePeriodRange`,
  `reportService`, `insightsService`. IA falha → fallback mensagem determinística.
- Resposta via `telegramApi.sendMessage` (contrato `CommandResult`).

### 8. Cleanup — `src/lib/ai/models.ts`

Remover role morto `document-text-reasoning` (sem caller, YAGNI por comentário
próprio). Tirar do `AiRole` type, do registry, e o modelo `nemotron-3-nano-30b`.
Confirmar via grep que nenhum caller usa antes de remover.

## Dashboard (widgets)

`src/app/(app)/dashboard/page.tsx` `DashboardContent`: adicionar chamadas ao
`Promise.all` (services direto), converter Decimal→number, passar props
serializáveis. 4 cards novos:
- Score → `KPICard` (tone por faixa) — linha dos summaries.
- Narrativa → `SectionCard`.
- Projeção → `ChartWrapper` (client, prop `number[]`).
- Tendências → `SectionCard`/`ChartWrapper`.
- Metas → widget progresso (`SectionCard` com barras) + link `/goals`.

Client components (charts): definir prop type `number`-based, converter no server
(espelhar `ClientExpenseByCardTree`).

## Execução (waves)

- **W0** schema: editar `prisma/schema.prisma` (SavingsGoal, enum, AlertType value,
  backrefs) → `npx prisma migrate dev --name savings_goals_insights` → revisar SQL
  gerada (cuidado índice parcial `fitId`, ver docs/03) → prod via Supabase MCP.
- **W1** paralelo (dependem só do schema/interfaces): `projections`, `insights`
  (score+trends), `goals` module+page, `alerts/recurring-suggestion`, cleanup AI.
- **W2** paralelo (dependem W1): `insights/narrative`, telegram `ask`, dashboard
  widgets (todos), `/goals` page final.
- **W3** review + gates: `npm run lint`, `tsc`, `test`. Corrigir. Commit por frente
  (conventional commits, scope por feature).

## Não-fazer (YAGNI)

- Doc Router genérico (`docs/51`) — extractors específicos bastam.
- Q&A web — só Telegram (decisão do user).
- Materializar narrativa/score em tabela — on-demand + cache.
- Persistir projeção — compute puro.
