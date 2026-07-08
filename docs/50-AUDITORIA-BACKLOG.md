# 50 — Auditoria Fable 5 & Backlog

Auditoria crítica do projeto (3 lentes: fluxo/UX, layout/design, lógica/bugs),
rodada em **2026-07-08**. Este arquivo é a fonte única do que foi encontrado,
o que já foi resolvido, e **como resolver** cada item ainda aberto.

Severidade: **crítico** (dinheiro/dados) · **alto** · **médio** · **baixo**.

---

## ✅ Já resolvido (P0 + tema claro)

| Item | Fix | Commit |
|---|---|---|
| Pagar fatura sem lock (duplo clique deixava cartão credor) | `SELECT ... FOR UPDATE` na linha do Card na 1ª statement da `$transaction` | `b1298f1` |
| OFX dedup (3 furos: in-batch, fallback key, duplo clique) | dedup in-batch + `toFixed(2)` nos 2 lados + índice único parcial `(accountId,fitId) WHERE fitId IS NOT NULL AND deletedAt IS NULL` + `skipDuplicates` | `7c55d3e` + migration `20260707231720` (aplicada no prod) |
| Orçamento soft-deletado travava recriação | `createBudget` reativa a linha soft-deletada (compare-and-set) em vez de P2002 | `450aea6` |
| Transferência errada sem conserto | `deleteTransaction` propaga pras 2 pernas (`updateMany` por `transferId`) + botão/confirm na UI + revalida `/accounts` | `7c55d3e` |
| Tema claro ilegível (tokens `on-*` sem override) | 9 overrides no `.light` + tint INFO `text-on-*` + botão destructive tokenizado; AA nos 2 temas | `7e342e0` |
| **Timezone** double-shift (T1/T2/T3) | AssetSnapshot/fatura atual/alerta saldo gravam-comparam `new Date()` real; `nowInSaoPaulo()` só p/ calendário | `83c635c` |
| **Telegram** consultas de gasto (TG1/TG2) | "hoje"/"quanto gastei"/"gastos mês"/"top categorias" via `reportService.cashflow`/`categoryTotals` (cash-flow, sem transfer/cartão) | `36dedfc` |
| **Design** (D1–D7) | contraste AA no dark, nav primary, mono sem faux-bold, safe-area iOS, dedup BrandMark/InitialsAvatar, badge parcela tokenizado, Sankey truncado | `24c01c7` |

---

## ✅ P1 — Timezone (double-shift do `nowInSaoPaulo()`) — RESOLVIDO `83c635c`

**Contexto:** `nowInSaoPaulo()` (`src/lib/date/timezone.ts`) retorna um `Date` com epoch
DESLOCADO (-3h em host UTC) — é helper de **calendário** (extrair year/month/day), NÃO
um instante real. Gravar esse Date no banco ou comparar `.getTime()` contra `timestamptz`
real dá bug. Referência de uso correto: `src/modules/transactions/installments.ts` (~L128)
usa `new Date()` real pro corte.

**Regra do fix:** onde o valor é **gravado no banco** ou **comparado via `.getTime()`**
contra timestamp real → trocar por `new Date()`. Onde é só pra extrair partes de
calendário/bucket → manter `nowInSaoPaulo()`.

- **T1 · alto · `assets/repository.ts:72-78` + `service.ts:44-47`** — AssetSnapshot gravado com `date: nowInSaoPaulo()` (-3h); na leitura `dayKeySP` desloca de novo → snapshot feito 00:00–06:00 SP cai no **dia anterior** (valorização de madrugada do dia 1º joga no mês anterior). **Fix:** gravar `new Date()`. ⚠️ Snapshots já gravados podem estar deslocados — avaliar correção do dado via MCP.
- **T2 · médio · `cards/service.ts` (~124,212) + `cycle.ts` `cycleContaining` (~150-162)** — `nowInSaoPaulo()` passado onde compara `refDate.getTime()` contra o instante de fechamento → fatura "atual" mostra ciclo anterior como aberto entre **00:00–03:00** do dia de fechamento. **Fix:** passar `new Date()` real; `nowInSaoPaulo()` só pra getters de calendário.
- **T3 · baixo · `accounts/service.ts:143-155`** — alerta "saldo insuficiente" com `refDate = nowInSaoPaulo()` → `calendarPartsSP` desloca de novo → entre 00:00–06:00 do **dia 1º** o "próximo mês" resolve errado e exclui as previstas do mês. **Fix:** idem T1/T2.

---

## ✅ P1 — Telegram (consultas de gasto) — RESOLVIDO `36dedfc`

**Contexto:** a base canônica de "gasto" é **fluxo de caixa** — só conta (`cardId IS NULL`),
`COALESCE(paidAt, date)`, `isPaid=true`, `transferId IS NULL`. Dashboard/KPIs/`categoryTotals`/
`cashflow` já seguem. O bot destoa.

- **TG1 · médio · `telegram/handlers.ts:223-241` (`handleQueryToday`)** — usa `transactionService.list({type: EXPENSE})` sem `isTransfer:false`, sem excluir `cardId`, sem excluir `isPaid=false` → transferir R$1000 entre contas responde "gastou R$1000 hoje". **Fix:** filtrar `isTransfer:false` + excluir cartão + só pagas (base cash-flow).
- **TG2 · médio/alto · `telegram/query.ts:139-141` (caixa) vs `query.ts:64-82` + `handlers.ts:209-216` (accrual+cartão)** — "quanto gastei" ≠ soma das "top categorias"/"gastos mês" no mesmo período. **Fix:** unificar **todas** as consultas de gasto do bot na base cash-flow, reusando `reportService.cashflow`/`categoryTotals`. Garantir "gastei no mês" == soma das top categorias. (Não mexer em IA/parsing/webhook — só as consultas de valor.)

> Mesma raiz do item **L8** (resumo semanal).

---

## ✅ P1 — Design — RESOLVIDO `24c01c7`

- **D1 · alto · `ui/button.tsx` + `transaction-type-badge.tsx:13-19`** — botão `accent` (`bg-accent text-white` ≈3.3:1) e badges sólidas Despesa/Receita + botão destructive no **dark** (branco sobre cor ≈3.3–3.76:1) falham AA. **Fix:** escurecer `--accent` (ex.: light `#C2410C` ~4.9:1 com branco) OU usar `text-accent-foreground`/foreground escuro. AA nos 2 temas, sem regredir o tema claro (on-* já corrigidos).
- **D2 · alto · `layout/bottom-nav.tsx:107`** — nav ativa usa `text-accent` (laranja = ação que move dinheiro) no mobile, mas sidebar/drawer usam `--primary`. **Fix:** BottomNav ativo → `primary`.
- **D3 · médio · `app/layout.tsx` + ~28 usos** — JetBrains Mono carregada só 400/500/600, mas ~28 lugares pedem `font-bold`/`font-extrabold` no `font-mono` → bold sintetizado borrado. **Fix:** carregar peso 700 OU rebaixar valores mono pra `font-semibold` (DS manda 400/500/600). Escolher 1 e aplicar consistente.
- **D4 · médio · `layout/bottom-nav.tsx:27`** — `fixed bottom-0 h-16` sem `env(safe-area-inset-bottom)` → labels sob a barra de gesto no iPhone. **Fix:** `pb-[env(safe-area-inset-bottom)]` no nav + compensar o `pb-28` do main.
- **D5 · médio · `sidebar.tsx:36` + `user-menu.tsx:47` + `sidebar.tsx:90` + `profile-card.tsx:57`** — logo hardcoded (gradiente/radius divergem de `BrandMark`) + avatar de iniciais implementado 3x (um com hex cru). **Fix:** sidebar consome `<BrandMark>`; extrair `<InitialsAvatar>` único pros 3.
- **D6 · médio · `transaction-type-badge.tsx:67` (`bg-orange-800/85` cru) vs `:97` (`bg-accent/15`)** — 2 badges de parcela diferentes; o segundo colide com CTA accent (docs/04 "Parcelamento" manda evitar). **Fix:** unificar num badge com laranja dessaturado **tokenizado**.
- **D7 · baixo · `shared/charts/sankey-chart.tsx:34-36`** — em 375px nomes longos de categoria atravessam os ribbons. **Fix:** truncar nome + tooltip, ou min-width com scroll horizontal no card.

---

## ✅ Lógica / bugs — RESOLVIDO (`73e429f` L1/L3/L4/L6 · `91e0549` L2/L5/L7/L8)

- **L1 · médio · `transactions/service.ts:157-164` (idem `recurring/service.ts:89-94`)** — editar EXPENSE→INCOME sem reenviar `categoryId`: `if (input.categoryId)` falso → não revalida → persiste INCOME com categoria de despesa; `categoryTotals(INCOME)` mostra "Alimentação" como receita. **Fix:** revalidar a categoria **resultante** (mesclada) sempre que `input.type` mudar.
- **L2 · baixo/médio · `reports/repository.ts:246-263` (`buildCsvWhere`)** — `lte: dateTo` cru, mas `date` nem sempre é meia-noite (lançamento rápido/Telegram) → export corta transação do último dia. `accountReport` já corrige com `endOfDayInclusive`; o CSV esqueceu. **Fix:** `endOfDayInclusive(dateTo)`.
- **L3 · médio (confirmar intenção) · `cards/repository.ts:82-99` (`updateCard`)** — nenhum código escreve em `CardCycle` (só `findMany`); a infra de histórico existe em `cycle.ts` mas `updateCard` sobrescreve o fallback → mudar fechamento 10→25 recalcula **toda fatura histórica** com a regra nova. **Fix:** `updateCard` criar um `CardCycle(effectiveFrom=agora)` quando closing/due mudam.
- **L4 · baixo/médio · `loans/service.ts:193-214` + `repository.ts:111-113` (`settleLoan`/`markInstallmentPaid`)** — lista de não-pagas e rateio computados **fora** da `$transaction`; `markInstallmentPaid` atualiza por `id` sem `where isPaid=false` → marcar parcela como paga durante a quitação faz o rateio sobrescrever o `amount` já pago. **Fix:** recheck `isPaid=false` no `WHERE` do update (`updateMany` + validar count) dentro da tx.
- **L5 · baixo (depende do banco) · `imports/ofx-parser.ts:30-40`** — parser ignora hora/TZ e trata `YYYYMMDD` como dia SP; extrato exportado em GMT (`...023000[0:GMT]` = 07/07 23:30 SP) importa como 08/07, desalinhando o dedup fallback. **Fix:** honrar o marcador `[N:TZ]` quando presente, convertendo pra dia SP.
- **L6 · baixo · `recurring/run.ts:59-73`** — template mensal com cron parado 3 meses leva 3 execuções pra repor (cada `fireOnce` avança `nextRun` 1 período). O lock otimista está correto. **Fix:** loop até `nextRun > now` dentro do `fireOnce` (ou aceitar o comportamento).
- **L7 · baixo · `transactions/repository.ts:387-396` + `reports/repository.ts:195-204` (`findCategoryNamesByIds`)** — única leitura do domínio sem escopo de `userId` (hoje os ids vêm de agregações já escopadas, sem exploit atual). **Fix:** adicionar `userId` no `where` (defesa em profundidade).
- **L8 · médio/alto · `alerts/weekly-summary.ts:30-46` (accrual+cartão) vs `:87-91` (caixa)** — resumo semanal mistura as 2 bases num mesmo alerta: semana só com compra no cartão mostra "Despesas: R$0" com top categorias cheias; GREEN/ANOMALY comparam categoria (accrual) com saldo (caixa). **Fix:** escolher UMA base por superfície e usar a mesma agregação nos 2 lados de cada comparação (mesma raiz de **TG2**).

---

## ✅ Fluxo / UX — RESOLVIDO (`59d4f10` F1/F2/F3/F6/F8 · `2eed0ca` F4/F5/F7/F9/F10/F11/F12)

- **F1 · alto · `layout/command-palette.tsx:30`** — header promete "Buscar… ⌘K" (docs 06-SCREENS: transações/contas/cartões/etc.), mas só filtra os itens de navegação; "mercado" dá "Nada encontrado". **Fix:** implementar busca de entidades (server action + debounce) OU trocar placeholder pra "Navegar…" até existir.
- **F2 · alto · `cards/pay-invoice-modal.tsx:34`** — pagar fatura abre com valor vazio (digitação manual de dinheiro = risco). **Fix:** pré-preencher com `min(fatura atual, saldo devedor)` OU botão "Usar total".
- **F3 · média · `cards/card-detail-view.tsx:126-131`** — "Ver parcelamentos" aponta pra `/installments` sem `?cardId`. **Fix:** `href={/installments?cardId=${card.id}}`.
- **F4 · média · `forms/new-transaction-form.tsx`** — docs listam "Tags (opcional)" no cadastro, mas o form de criação não tem o campo (só o de edição). **Fix:** incluir `TagMultiSelect` (colapsado/opcional).
- **F5 · média · `transactions/transaction-row-actions.tsx`** — "Duplicar" está nos docs mas não existe em nenhuma tabela. **Fix:** ação "Duplicar" abrindo o modal de criação pré-preenchido.
- **F6 · alto · `dashboard/quick-actions.tsx:44-73` + `command-palette.tsx:19-24`** — "Transferência"/"Novo cartão"/"Nova conta"/"Novo parcelamento" só navegam pra listagem (clique extra; "Transferir" nem existe com <2 contas). **Fix:** abrir o modal direto (promover modais pro shell como o de transação, ou `?new=1` lido pela página).
- **F7 · média · `forms/new-transaction-form.tsx:328-341` + `entity-select.tsx:112-129`** — base zerada: CTA "Criar primeira transação" abre modal com selects "Nada encontrado", sem caminho pra criar conta. **Fix:** usar o `onCreate` do `EntitySelect`, ou trocar o CTA pra "Criar primeira conta" quando não houver contas.
- **F8 · baixo · `cards/card-detail-view.tsx`** — detalhe CREDIT não tem "+ Compra" (o MEAL tem "+ Recarga"). **Fix:** botão "+ Compra" → `openTransactionModal(EXPENSE, card.id)`.
- **F9 · baixo · `dashboard/recent-transactions-table.tsx:85-111`** — preview "Últimas transações" sem editar/excluir/duplicar (prometido em 06-SCREENS). **Fix:** reusar `TransactionRowActions`.
- **F10 · média · `tables/data-table.tsx:94-103`** — `searchInput` inicializado com `search.value` e nunca re-sincronizado: "Limpar filtros" limpa `?q=` mas o termo continua no input. **Fix:** sincronizar `searchInput` quando `search.value` muda externamente (padrão "adjusting state").
- **F11 · média · `transactions/new-installment-modal.tsx:35-58` vs `installments/installment-form-modal.tsx:78-86`** — 2 forms quase idênticos; o de /transactions só reseta após salvar (cancelar+reabrir mostra dado velho); títulos/toasts divergem. **Fix:** unificar num modal compartilhado com reset-ao-abrir.
- **F12 · média · `transactions/period-presets.ts:7-15`** — `/transactions`, `/reports`, dashboard só têm 5 presets (sem range livre); `/accounts/[id]` tem "Personalizado". Inconsistência entre telas irmãs. **Fix:** adicionar "Personalizado" (De/Até) ao `PERIOD_OPTIONS` compartilhado.

---

## ✅ Layout / A11y — RESOLVIDO (`4af0cbf`)

- **LA1 · baixo · `kpi-card.tsx:84` (`text-on-success`) vs `kpi-summary-card.tsx:22` + `weekly-summary-box.tsx:112` (`text-success`)** — 2 verdes pro mesmo papel "valor positivo" na mesma dobra. **Fix:** padronizar (on-* pra tint, base pra texto sobre card) e documentar.
- **LA2 · baixo · `kpi-card.tsx:60` (`rounded-[16px]`) vs `section-card.tsx:22`/`chart-wrapper.tsx:34` (`rounded-xl`=14px)** — cards lado a lado com raios diferentes. **Fix:** fixar um valor único de card.
- **LA3 · baixo · `account-grid.tsx:82` (sm:2 lg:4) vs `cards-grid.tsx`/`budget-grid.tsx` (1→lg:2) vs `installments-board.tsx`/`loans-board.tsx` (1→lg:3)** — mesma família ("grid de entidade"), densidade diferente no tablet. **Fix:** padronizar o degrau `sm:`/`md:` intermediário.
- **LA4 · baixo · `category-form-modal.tsx:211` + `tag-form-modal.tsx:116` + `account-form-modal.tsx:171`** — `<Check className="text-white">` sobre cor arbitrária do preset some em amarelos/claros. **Fix:** check em cor por luminância, ou anel `ring-foreground` no swatch ativo.
- **LA5 · baixo · `shared/icon-action-button.tsx:53`** — `size-7` (28px) pra toque + único interativo sem `FOCUS_RING_CLASS`. **Fix:** adicionar o ring padrão; aumentar área de toque via padding sem crescer o visual.
- **LA6 · baixo/médio · `dashboard/expense-category-chart.tsx:7` (duplicada em `money-flow-sankey-chart.tsx:9`)** — paleta cíclica de 7 cores: 8ª categoria volta a `--primary` (fatias vizinhas de mesma cor); accent e warning são matizes quase iguais. **Fix:** intercalar matizes distantes + variar luminância nas voltas do ciclo.

---

## 🔭 Follow-ups descobertos (não críticos, ficaram fora das cercas)

Itens que os agents acharam ao resolver o backlog, mas fora do escopo de cada ticket:

- **`alerts/anomaly.ts` + `green.ts`** — mesma raiz das 2-verdades do L8 (usam `groupExpensesByCategoryInRange`, accrual+cartão). L8 só corrigiu o `weekly-summary.ts`. Trocar por `reportService.categoryTotals` nos dois.
- **`transactions/repository.ts` `findCategoryNamesByIds`** — `userId` ficou OPCIONAL (callers em `transactions/service.ts` + `alerts/anomaly.ts` fora da cerca do L7). Passar `userId` nesses callers e tornar obrigatório.
- **`loans/repository.ts` `update()`** — mesmo shape de TOCTOU do L4 (lê `existing` antes de escrever sem recheck). Aplicar o mesmo padrão se virar problema.
- **`cards/cycle.ts`** — `seedCycleIfMissing` + novo ciclo podem gerar 2 `CardCycle` com `effectiveFrom` igual se o cartão for editado no mesmo ms da criação (inofensivo hoje; tie-break `>=` em `resolveRuleAt` se aparecer).
- **`installments-board.tsx` + `new-installment-tile.tsx`** — labels "Novo parcelamento"/"Criar primeiro parcelamento" divergem do canônico "Nova compra parcelada" (F11 alinhou só os modais).
- **`recent-transactions-table.tsx`** — as novas ações de linha buscam 5 transações completas via `getTransactionAction` no mount; se o padrão espalhar, criar um `listTransactionsByIdsAction` batch.
- **`components/accounts/ui-actions.ts`** (novo, F6) — adapter fino Decimal→string pro TransferModal (espelha `cards/ui-actions.ts`); revisar se quer manter esse padrão.

## Notas de execução

- Auditoria feita com **Fable 5** (3 agents em paralelo). Os fixes P0 + tema saíram com Fable 5; o batch P1 (timezone/telegram/design) começou com Fable mas **caiu no limite de sessão** — timezone/telegram já estavam prontos (verificados + commitados), design foi refeito com Sonnet. **Auditoria 100% resolvida** — P0, tema, P1 (timezone/telegram/design) e todo o backlog (lógica L1–L8, fluxo F1–F12, layout LA1–LA6). Restam só os follow-ups acima (não críticos), resolvidos pelos 5 agents Sonnet 5 em paralelo.
- Padrão de trabalho: agent por área (sem conflito de arquivo), `tsc`/`eslint` limpos, teste tsx contra Docker local, **sem commit** pelo agent — coordenador commita + aplica migration de prod via **MCP do Supabase**.
- Pontos verificados e **OK** (não são bug): rateio de centavos exato (parcela/empréstimo), juros compostos anual→mensal, transferência cria 2 pernas atômico, soft-delete + `userId` consistentes nos repositories, `parseFlexibleDate` trata `YYYY-MM-DD` como meia-noite SP, clamp de dia 29-31 em meses curtos.
