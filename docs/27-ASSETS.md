# 27 - ASSETS.md

# Patrimônio (Assets)

Este módulo representa todos os bens e ativos financeiros do usuário.

Ele permite visualizar o patrimônio total acumulado ao longo do tempo.

---

# Objetivo

Permitir que o usuário entenda:

* quanto ele possui de patrimônio total
* evolução do patrimônio ao longo do tempo
* composição dos seus bens
* valor líquido real

---

# Regra Principal

Assets representam valores acumulados, não fluxo de caixa.

---

# Estrutura do Asset

```text id="a1k8qp"
id (cuid)

userId

name

type

purchaseValue (Decimal 12,2)

currentValue (Decimal 12,2)

purchaseDate

notes

createdAt

updatedAt

deletedAt
```

---

# Tipos de Asset

```text id="t4v2qn"
PROPERTY        → imóveis
VEHICLE         → veículos
INVESTMENT      → investimentos
FGTS            → FGTS
EMERGENCY_FUND  → reserva de emergência
OTHER           → outros
```

---

# Lógica de Valor

## Valor de compra

Quanto o ativo foi adquirido inicialmente.

---

## Valor atual

Quanto o ativo vale hoje. Guardado em `Asset.currentValue`.

Pode ser:

* atualizado manualmente
* ajustado futuramente via integração

Toda atualização de `currentValue` grava um `AssetSnapshot` (ver seção abaixo), preservando o histórico de valor pro gráfico de evolução patrimonial.

---

# Histórico de Valor (AssetSnapshot)

`Asset.currentValue` guarda só o valor de agora. A série temporal pro gráfico de evolução do patrimônio vem de uma entidade separada:

```text id="s6v3qp"
AssetSnapshot
  id (cuid)
  assetId (cuid, FK Asset)
  value (Decimal 12,2)
  date
```

Cada vez que o usuário atualiza o valor de um asset, cria-se um novo `AssetSnapshot(assetId, value, date)`. O gráfico de "Evolução" (ver seção abaixo) é a série de snapshots agregada por data — não é recalculado, é histórico real do que o usuário informou ao longo do tempo.

---

# Patrimônio Total

```text id="p3v8qn"
Total = soma de todos currentValue dos assets
```

---

# Criação de Asset

## Fluxo

```text id="c7m2qp"
Nome do ativo

Tipo

Valor de compra

Valor atual

Data de aquisição

Salvar
```

---

# Interface

## Card de Asset

```text id="a9m3qp"
Polo Highline

R$ 72.000

↑ +R$ 5.000

Veículo
```

---

# Lista de Assets

Exibidos como cards agrupados por tipo:

```text id="l2k7qp"
Imóveis
Veículos
Investimentos
Reserva
Outros
```

---

# Detalhe do Asset

Ao clicar:

Mostrar:

* histórico de valor (série de `AssetSnapshot`)
* evolução
* notas
* comparação compra vs atual

---

# Integração com Dashboard

Assets alimentam:

* patrimônio total
* evolução patrimonial
* gráfico de composição

---

# Gráficos

## Composição do patrimônio

Ex:

```text id="g4v2qp"
Imóveis     60%
Investimentos 25%
Veículos     10%
Outros       5%
```

---

## Evolução

Linha do tempo do patrimônio total, construída a partir dos `AssetSnapshot` de cada asset agregados por data.

---

# Regras de Negócio

## Regra 1

Assets não impactam saldo de conta **sozinhos**. Aportes de investimento
(`type=INVESTMENT`, ver `28-INVESTMENTS.md`) debitam a conta via `Transaction`
`EXPENSE` com `assetId` e sobem `currentValue` — o movimento de caixa é a
Transaction, não o Asset.

---

## Regra 2

Assets são separados de fluxo de caixa.

---

## Regra 3

Assets são apenas informativos e analíticos.

---

# Filtros

```text id="f6v2qn"
Tipo

Valor

Data de compra

Valor atual
```

---

# Estados

## Empty

```text id="e3k7qp"
Nenhum patrimônio registrado.

[ Adicionar primeiro ativo ]
```

---

# Atualização de Valor

O usuário pode atualizar manualmente:

* valor atual do asset

Futuro:

* integração com mercado (opcional)

---

# Regras de UX

* assets devem ser simples
* foco em clareza
* evitar excesso de campos
* permitir edição rápida

---

# Performance

* assets são poucos em quantidade
* lista sempre traz todos os assets do usuário, **sem paginação server-side** (decisão fechada — igual contas/cartões/categorias/tags)
* podem ser carregados todos de uma vez

---

# Integração com Budget e Transactions

Assets não alteram orçamento sozinhos.

Aportes de investimento (docs/28-INVESTMENTS.md) **referenciam** o Asset via
`Transaction.assetId` e debitam a conta escolhida. Demais tipos de Asset
continuam só informativos (valor manual + snapshots).

---

# Filosofia

Assets representam o “resultado acumulado da vida financeira”.

Enquanto Transactions mostram o dia a dia,

Assets mostram o que foi construído ao longo do tempo.
