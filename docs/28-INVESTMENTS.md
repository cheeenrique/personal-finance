# 28 - INVESTMENTS.md

# Investimentos (CDB / % do CDI)

Página operacional `/investments` para produtos financeiros indexados ao CDI
(ex.: Cofrinho Nubank a 115% do CDI). Domínio = `Asset` com `type=INVESTMENT`
(mesmo padrão de Financiamento = `Loan` com `kind=FINANCING`).

---

# Objetivo

* cadastrar o produto (nome + % do CDI)
* aportar a partir do saldo de uma conta (teto duro = saldo disponível)
* consultar CDI do dia (Gemini com cache, ou manual)
* projetar rendimento estimado (juros simples — não atualiza patrimônio sozinho)

---

# Relação com Patrimônio

* `/investments` — criar, aportar, projetar
* `/assets` — continua listando `INVESTMENT` no grupo Investimentos
* criação de tipo INVESTMENT no form genérico de `/assets` fica **escondida**
  (use `/investments`)

---

# Modelo

## Asset (campos de yield)

```text
yieldBenchmark            NONE | CDI   (INVESTMENT usa CDI)
yieldPercentOfBenchmark   Decimal?     (ex.: 115.00 = 115% do CDI)
```

## Transaction (aporte)

```text
assetId                     FK opcional → Asset
yieldPercentOfBenchmark     Decimal?  (override do aporte; null = default do Asset)
```

Aporte = `Transaction` `EXPENSE` paga na conta + sobe `Asset.currentValue` +
`AssetSnapshot`.

## MarketIndexQuote (cache CDI)

```text
index               CDI
date                meia-noite SP do dia
annualRatePercent   Decimal
source              GEMINI | MANUAL
fetchedAt
@@unique([index, date])
```

---

# Fluxos

## Criar investimento

Nome + % do CDI. Aporte inicial opcional (conta + valor ≤ saldo + categoria
`Investimento (aporte)`).

## Aportar

1. Ownership do Asset INVESTMENT + conta + categoria EXPENSE
2. Se `amount > saldo da conta` → erro `INSUFFICIENT_ACCOUNT_BALANCE` (bloqueio)
3. Cria Transaction EXPENSE paga com `assetId`
4. `currentValue += amount` + snapshot

## CDI do dia

Cache → Gemini (`source: "cdi-quote"`) → grava cache. Sem key/falha: UI
oferece entrada manual (`source=MANUAL`). Sempre rotular como **estimativa**
(Gemini ≠ BCB).

Taxa efetiva = `cdiAnnual * (percentOfCdi / 100)`.

## Projeção

```text
yield = principal * (cdi/100) * (percent/100) * (days/365)
projected = principal + yield
```

Juros simples. Não grava snapshot nem altera `currentValue`.

---

# Fora de escopo (esta entrega web)

* resgate/saque de volta pra conta
* atualização automática periódica de `currentValue` por rendimento
* Tesouro / ações / fundos com regras próprias

---

# Integração Telegram

* **Consulta** (`queryType=investments`): lista nome, % CDI, posição e total.
* **Aporte** (`intent=invest`): "investi R$ 100 no Cofrinho Nubank" → resolve
  o Asset pelo nome, conta (citada ou default), valida saldo e chama
  `contributeToInvestment`. Ver `docs/30-TELEGRAM.md`.

---

# Integração patrimonial

Aporte reduz saldo da conta e sobe o asset → patrimônio total
(contas + assets) permanece estável. Não somar o aporte em outro KPI.
