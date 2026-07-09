# 23 - INSTALLMENTS.md

# Parcelamentos

Este módulo gerencia compras parceladas realizadas no cartão de crédito.

Ele não representa transações individuais soltas — é uma compra única, dividida ao longo do tempo, onde cada parcela **é** uma Transaction real.

---

# Objetivo

Permitir que o usuário visualize e controle:

* compras parceladas ativas
* progresso de pagamento
* impacto futuro nas faturas
* valor total já pago
* valor restante
* parcelas futuras

---

# Regra Principal — fonte única

Duas entidades, sem duplicação:

```text id="p1v8mz"
InstallmentPurchase   → a compra (o "guarda-chuva")
Transaction           → cada parcela, uma a uma
```

**Não existe tabela `Installment` separada.** Isso eliminaria uma tripla representação (Installment + Transaction + Card statement calculado) para o mesmo fato financeiro. A parcela É a Transaction — nada mais.

---

# Estrutura da Compra Parcelada (InstallmentPurchase)

```text id="p1v9mz"
id

userId

cardId

description

totalAmount (Decimal 12,2)

installmentsCount (int)

firstDueDate

createdAt
```

Sem `installmentValue`, `paidInstallments`, `remainingInstallments`, `status` persistidos — tudo isso é **derivado** das Transactions vinculadas (ver seção "Valores Derivados" abaixo).

---

# Parcela = Transaction

Cada parcela é uma Transaction normal (ver 20-TRANSACTIONS), com dois campos extras preenchidos:

```text id="i4k9vn"
installmentPurchaseId   → aponta pra InstallmentPurchase
installmentNumber       → 1, 2, 3... até installmentsCount
```

Demais campos da parcela seguem o padrão de Transaction:

```text id="i5k9vn"
type = EXPENSE
amount = totalAmount / installmentsCount (Decimal, arredondado; ver "Rateio" abaixo)
cardId = InstallmentPurchase.cardId
categoryId = categoria escolhida na criação da compra
date = data de vencimento daquela parcela específica
isPaid = true (mesma regra de compra no cartão — já é gasto confirmado, ver 22-CREDIT_CARDS)
```

Não existe status `PENDING/PAID/CANCELLED` por parcela separado do que já existe em Transaction (`isPaid`, `deletedAt`).

---

# Rateio do Valor Total

`totalAmount` nem sempre divide exato por `installmentsCount`. Regra:

* Todas as parcelas recebem `floor(totalAmount / installmentsCount)`, exceto a última, que absorve o resto (arredondamento de centavos).
* Soma das `amount` de todas as parcelas deve sempre bater exatamente com `totalAmount`.

---

# Valores Derivados

Nada fica persistido além do que está em InstallmentPurchase e nas Transactions. Tudo abaixo é calculado sob demanda:

```text id="d1v8mz"
parcelas pagas       = COUNT(Transaction WHERE installmentPurchaseId = X AND date <= hoje)
parcelas restantes   = installmentsCount - parcelas pagas
valor pago           = SUM(amount WHERE installmentPurchaseId = X AND date <= hoje)
valor restante       = totalAmount - valor pago
```

"Hoje" é calculado em **America/Sao_Paulo**. Uma parcela é considerada "paga" quando sua data de vencimento já passou — segue a mesma lógica de compra confirmada no cartão (não existe um "pagamento manual" de parcela individual).

---

# Fluxo de Criação

```text id="c3v8kp"
Usuário cria compra parcelada

↓

Informa:
- descrição
- valor total
- número de parcelas
- cartão
- categoria

↓

Sistema cria 1 InstallmentPurchase

↓

Sistema cria N Transactions (uma por parcela)
cada uma com installmentPurchaseId + installmentNumber + date de vencimento própria
```

---

# Regra de Cartão

* `totalAmount` impacta o limite usado uma vez só, na primeira ocorrência (a soma das parcelas geradas nunca ultrapassa `totalAmount`)
* cada parcela entra na fatura do seu próprio ciclo, pela sua `date`

---

# Regra de UX Principal

Parcelamentos nunca devem ser tratados como várias compras soltas na UI principal (lista de transações).

Sempre agrupados visualmente como:

```text id="u2k7qn"
1 compra → N parcelas
```

A lista principal de Transactions não deve exibir cada parcela como linha solta e desconectada — deve indicar visualmente que pertence a um `InstallmentPurchase` (ex.: ícone + "3/10").

---

# Visual no Dashboard

Cada parcelamento deve aparecer como:

```text id="v9m3qp"
MacBook Pro

██████░░░░

4 / 10 parcelas

R$ 5.944 pagos
R$ 8.916 restantes
```

Todos os números acima (`4/10`, pago, restante) vêm do cálculo derivado descrito em "Valores Derivados" — nunca de um contador incrementado manualmente.

---

# Informações obrigatórias

* descrição da compra
* valor total
* valor pago (derivado)
* valor restante (derivado)
* parcelas pagas (derivado)
* parcelas restantes (derivado)
* cartão associado
* categoria

---

# Parcelas Futuras

Parcelas futuras (Transactions com `date` no futuro) aparecem em:

* faturas futuras do cartão
* previsões do dashboard

Não há necessidade de "gerar" parcelas futuras sob demanda — todas as N Transactions já existem desde a criação da compra (ver Fluxo de Criação).

---

# Cancelamento

Ao cancelar uma compra parcelada:

* as Transactions das parcelas futuras (`date` > hoje) recebem soft delete (`deletedAt`)
* parcelas já vencidas/pagas mantêm o histórico intacto

---

# Troca de categoria

A categoria não vive em `InstallmentPurchase` — cada parcela (`Transaction`) carrega o mesmo `categoryId` na criação. No modal de detalhes (`/installments`), o usuário pode trocar a categoria: `updateMany` em **todas** as parcelas ainda vivas (`deletedAt: null`). Parcelas soft-deletadas (cancelamento) ficam intactas.

---

# Regras de Negócio

## Regra 1

Parcelamento nunca altera o `totalAmount` da compra depois de criado.

---

## Regra 2

Parcelas com `date` futura são previsões financeiras — entram em faturas futuras e projeções, mas ainda não impactam "Despesas do mês" atual.

---

## Regra 3

Parcelas sempre refletem faturas reais do cartão — a fatura de um ciclo é a soma de todas as Transactions (parceladas ou não) com `date` dentro daquele ciclo.

---

## Regra 4

Sem tripla representação. A única fonte de verdade é: `InstallmentPurchase` (o guarda-chuva) + `Transaction` (cada parcela). Nunca um terceiro registro para o mesmo fato.

---

# Integração com Transactions

Cada parcela **é** uma Transaction — não "gera" nem "referencia" uma Transaction à parte:

* `type = EXPENSE`
* `cardId` preenchido
* `installmentPurchaseId` + `installmentNumber` preenchidos

---

# Integração com Cartões

Parcelamentos afetam:

* limite utilizado (soma das parcelas já lançadas)
* faturas futuras
* previsibilidade de dívida

Ver 22-CREDIT_CARDS para a regra completa de `isPaid` no contexto do cartão.

---

# Integração com Dashboard

Parcelamentos alimentam:

* dívida futura
* comprometimento mensal
* evolução de pagamentos

---

# Listagem de Parcelamentos

Cada item deve mostrar:

* nome
* progresso (derivado)
* valor total
* parcelas pagas (derivado)
* parcelas restantes (derivado)
* cartão

---

# Filtros

```text id="f7k3qn"
Ativos (parcelas restantes > 0)

Finalizados (parcelas restantes = 0)

Cartão

Categoria

Valor

Data
```

---

# Estados

## Loading

Skeleton de cards

---

## Empty

```text id="e2v8qp"
Nenhum parcelamento ativo.

[ Criar primeiro parcelamento ]
```

---

# UX Importante

O usuário deve sempre sentir que:

* ele está no controle da dívida
* nada está escondido
* tudo é previsível

---

# Performance

* cálculos derivados usam agregação (`SUM`, `COUNT`) por `installmentPurchaseId`, direto no Postgres
* usar índice em `installmentPurchaseId`
* evitar loop de parcelas no frontend — sempre uma query agregada

---

# Filosofia

Parcelamentos transformam consumo em previsibilidade.

O objetivo não é esconder dívida.

É tornar ela compreensível e gerenciável — com uma única fonte de verdade (Transaction), sem estruturas paralelas que possam divergir.
