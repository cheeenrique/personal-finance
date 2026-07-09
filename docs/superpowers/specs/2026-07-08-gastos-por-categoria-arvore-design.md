# Gastos por categoria — árvore por cartão (+ remoção do Sankey)

Data: 2026-07-08
Status: implementado (2026-07-09)

## Problema

O donut "Gastos por categoria" do Dashboard conta o dinheiro do cartão de
crédito **duas vezes**:

1. As **compras itemizadas** feitas no cartão (Mercado, Farmácia, Delivery…),
   cada uma com sua categoria — vêm de `Transaction` com `cardId` preenchido.
2. O **pagamento da fatura**, que o usuário lança como uma `EXPENSE` manual com
   categoria **"Cartão de Crédito"** (`cardId` nulo). Em Julho/2026 = R$ 6.183,06
   (4 lançamentos).

São o mesmo dinheiro (compras vs. fatura que as quita), em ciclos diferentes.
Somados, inflam o total: donut mostra R$ 19.978,61 quando o gasto real do mês é
menor. O usuário quer que o gráfico fique fiel, **sem mudar a estrutura de
dados** (a informação necessária já existe: `cardId`, nome da categoria, `Card`).

Fato de apoio (confirmado no banco, Julho/2026):

```
KPI "Despesas do mês" (caixa, conta-only) = 14.424,85
  = fatura "Cartão de Crédito" 6.183,06 + gastos da conta sem cartão 8.241,79
```

O KPI de caixa já é coerente (não dobra) porque conta a fatura e ignora as
compras no cartão. O donut, ao ser accrual (por `date`, inclui cartão) E manter
a categoria de fatura, é quem dobra.

## Decisão

**Visão itemizada por cartão (accrual)**, com a lista lateral virando uma
árvore expansível. Cada real aparece uma única vez.

Regras:

- **Base accrual, por `date`** (mantém o comportamento atual do donut) — é o que
  faz a compra no cartão aparecer na categoria certa (Mercado, Farmácia) na data
  da compra.
- **Cartão = pasta.** Toda `Transaction` com `cardId` é agrupada sob o cartão
  dela. Vale para CREDIT (Nubank - Pessoal, Nubank - MEI, Mercado Pago, Porto
  Bank) e MEAL (Eva). Cada cartão é uma pasta expansível com suas categorias.
- **Conta = flat.** `Transaction` sem `cardId` aparece direto pela categoria
  (Financiamento, Dízimo, Impostos, Água…), sem pasta.
- **Fatura sai da soma.** A categoria de pagamento de fatura ("Cartão de
  Crédito") é **excluída** deste gráfico — ela é o agregado que as compras
  itemizadas já representam. É o que mata o 2x.
- **Total resultante** ≈ R$ 12.656 (Julho, cada real uma vez). **Não bate** com
  o KPI "Despesas do mês" (14.424, caixa) — de propósito: "onde gastei" vs. "o
  que saiu da conta", mesma divergência accrual/caixa que já existe entre outras
  telas.

### Como identificar a fatura pra excluir

Sem mudança de schema (restrição do dono). A categoria de fatura é identificada
por **nome**, via constante:

```ts
const CARD_INVOICE_CATEGORY_NAMES = ["Cartão de Crédito"];
```

Heurística deliberada e a parte mais frágil do design: se o usuário renomear a
categoria ou usar outro nome pra pagar fatura, a exclusão para de valer e o 2x
volta. Aceito agora porque (a) o dono pediu explicitamente pra não mexer em
estrutura e (b) a app é escopada por `userId`, então o nome é estável para este
usuário. Constante isolada e comentada pra facilitar troca futura (o caminho
robusto seria migrar as faturas pro tipo `CARD_PAYMENT`, fora de escopo).

## Arquitetura

Regra de ouro do projeto: lógica de domínio só em `src/modules/`. A agregação e
a exclusão vivem no módulo `reports`; o componente só renderiza.

### Data layer — `modules/reports`

**Novo tipo** (`reports/types.ts`):

```ts
export type CardExpenseGroup = {
  cardId: string;
  cardName: string;
  cardType: CardType;           // CREDIT | MEAL (rótulo/ícone na UI)
  total: Money;
  categories: CategoryExpenseTotal[];  // filhas, ordenadas desc
};

export type ExpenseByCardTree = {
  cards: CardExpenseGroup[];              // pastas, ordenadas por total desc
  accountCategories: CategoryExpenseTotal[]; // conta (cardId nulo), flat, desc
};
```

**Novo método de repositório** (`reports/repository.ts`)
`groupExpenseByCardAndCategoryInRange(userId, range)`:

- `$queryRaw` agrupando por `("cardId", "categoryId")`.
- Filtros: `userId`, `deletedAt IS NULL`, `isPaid = true`, `transferId IS NULL`,
  `type = 'EXPENSE'`, `categoryId IS NOT NULL`, `date` no range.
- **NÃO** filtra `cardId` (queremos os dois: com e sem cartão).
- Retorna linhas cruas `{ cardId: string | null, categoryId: string, sum }`.

**Novo método de serviço** (`reports/service.ts`)
`expenseByCardTree(userId, dateFrom, dateTo): Promise<ExpenseByCardTree>`:

1. Chama o repositório (com `endOfDayInclusive` no `dateTo`, mesmo padrão de
   `categoryTotals`).
2. Resolve nomes de categoria (`findCategoryNamesByIds`) e de cartão (novo
   `findCardNamesByIds` OU reaproveitar via `Card` — decidir no plano).
3. **Exclui** linhas cuja categoria ∈ `CARD_INVOICE_CATEGORY_NAMES`.
4. Monta a árvore: linhas com `cardId` → agrupa por cartão (soma `total`,
   ordena categorias desc); linhas sem `cardId` → `accountCategories` flat.
5. Ordena `cards` e `accountCategories` por total desc.

`categoryTotals` continua **intocado** (ainda alimenta `/reports` "Por
categoria", Telegram, resumo semanal — ver comentários no service). Só o
Dashboard troca de fonte.

### Dashboard (`app/(app)/dashboard/page.tsx`)

- Troca `reportService.categoryTotals(...)` (que alimenta `expenseByCategory`)
  por `reportService.expenseByCardTree(...)`.
- Remove a chamada `reportService.sankeyFlow(...)` e a variável `moneyFlow`.

### UI — `components/dashboard/expense-category-chart.tsx`

Recebe `ExpenseByCardTree`. Deriva:

- **Donut**: uma fatia por cartão (label = nome do cartão, value = `total` da
  pasta) + uma fatia por categoria de conta. Cor cíclica via
  `resolveCategoryColor`. Total central = soma de tudo.
- **Lista lateral (árvore)**: itens de topo = cartões (expansíveis, mostram as
  categorias filhas ao abrir) + categorias de conta (flat, sem expandir).
  Expandir/colapsar é estado local do componente (client). Cartão fechado por
  padrão. Percentual de cada item de topo relativo ao total geral.
- Empty state: sem gastos (nenhum cartão e nenhuma categoria de conta) → mensagem
  atual "Nenhum gasto registrado neste mês ainda."

Detalhe de UX: uma categoria (ex. "Mercado") pode aparecer dentro de vários
cartões E como categoria de conta — é correto, cada `Transaction` cai em um
único bucket (o `cardId` dela ou conta). Sem duplicação real.

## Remoção do Sankey "Fluxo de dinheiro"

Deletar por completo (uso 100% Dashboard, confirmado por grep):

- `components/dashboard/money-flow-sankey-chart.tsx`
- `components/shared/charts/sankey-chart.tsx` (só o Sankey usa)
- `reports/service.ts`: função `sankeyFlow` + export
- `reports/types.ts`: `SankeyFlowReport`, `SankeyFlowNode`, `SankeyFlowLink`,
  `SANKEY_HUB_NAME`, `SANKEY_LEFTOVER_NAME`
- `dashboard/page.tsx`: import, chamada, `<MoneyFlowSankeyChart>`
- Dependência da lib de Sankey no `package.json` se nenhum outro consumidor
  (verificar no plano).

`resolveCategoryColor` **permanece** (o donut usa).

## Fora de escopo

- `/reports` "Por categoria" e outros consumidores de `categoryTotals` têm o
  mesmo 2x — ficam para uma rodada futura.
- Migrar faturas pro tipo `CARD_PAYMENT` (fix robusto do modelo) — não agora.
- Evolução mensal já foi alinhada ao KPI de caixa em mudança anterior; não é
  parte deste spec.

## Testes

- `expenseByCardTree`: cenário com compras em 2 cartões + conta + 1 categoria de
  fatura → fatura excluída, árvore correta, totais por cartão certos, ordenação
  desc.
- Exclusão: categoria "Cartão de Crédito" nunca aparece em `cards` nem em
  `accountCategories`.
- Categoria repetida entre cartões e conta soma certo em cada bucket, sem vazar.
- Empty: sem gastos → árvore vazia.
