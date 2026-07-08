# 52 — Financiamento: Antecipação (2 modelos)

**Status:** planejado. O simulador atual só faz o modelo C6 (por quantidade de
parcelas) — **desabilitado** até implementar os 2 modelos. Data: 2026-07-08.

O simulador de antecipação precisa suportar **dois modelos reais e diferentes**,
porque carro (Price) e casa (SAC/TR) antecipam de formas distintas.

## Modelo A — por QUANTIDADE de parcelas (C6 / carro / Price)
Já implementado (`modules/loans/simulate.ts` `advance`). Tela do C6 "Antecipar
parcelas":
- Input: **data do pagamento** (até o próximo vencimento) + **ordem** (a partir
  da próxima parcela | da última parcela) + **quantidade de parcelas**.
- `última` = reduz prazo (elimina as mais distantes, maior desconto). `próxima`
  = adianta as próximas (prazo final igual).
- Desconto = **valor presente** das parcelas antecipadas.
- Saída: Parcelas · Desconto de juros · Total a pagar hoje · Período · antes→depois.

## Modelo B — por VALOR (Caixa / casa / SAC-TR) — A IMPLEMENTAR
Tela da Caixa "Reduzir saldo ou quitar":
- Card topo: **Saldo para liquidação** (ex.: R$161.855,10), Prazo atual (320
  meses), Prestação atual.
- Input: **"Quanto você gostaria de pagar?"** (valor a amortizar, **mínimo
  R$50,00**) + toggle **"Selecione para quitar o contrato"** (paga o saldo todo).
- **Tipo de amortização**: toggle **Prazo** | **Prestação**.
  - **Prazo**: "diminui o número de prestações restantes para a liquidação do
    saldo devedor". Prestação fica ~igual, prazo cai. Ex. real: pagar
    R$10.869,76 → prazo 320 → **271 meses** (−49), novo saldo R$150.361,13,
    nova prestação R$1.116,38.
  - **Prestação**: mantém o prazo, **reduz o valor da parcela** (recalcula sobre
    o saldo menor).
- Resultado (Prazo): Prazo atual → Novo prazo · Novo saldo devedor · Nova
  prestação · Data da simulação · Juros diários · **Amortização efetiva**
  (= valor pago − juros diários acumulados do dia).

## Como unir no app
O modal de "Simular antecipação" oferece **os dois modelos + quitar**, com
**default pelo tipo do financiamento**:
- **Antecipar parcelas** (quantidade + ordem) — default pro **carro/Price**.
- **Amortizar valor** (R$X + Prazo/Prestação) — default pra **casa/Caixa/SAC**.
- **Quitar tudo**.
Ambos disponíveis em qualquer financiamento (dá pra trocar). Isso é o mockup
original confirmado pelo dono (que tinha sido reduzido só pro C6).

## Matemática do Modelo B (aproximada — o app não modela TR)
Saldo devedor de referência = valor presente das parcelas restantes (`type=full`
do `simulate.ts` já calcula). `amortização efetiva` ≈ valor pago − juros do dia.
- **Prazo** (`reduce_term`): saldo' = saldo − amortização; mantém a prestação;
  recomputa o nº de parcelas (remove as do FIM cujo VP soma ≈ valor). Novo prazo
  menor, prestação ~igual.
- **Prestação** (`reduce_installment`): saldo' = saldo − amortização; mantém o nº
  de parcelas restantes; recomputa PMT (`saldo' × i / (1−(1+i)^−n)`) → parcela
  menor. Para SAC, recalcula o cronograma decrescente sobre saldo'.
Backend: os modos `reduce_term`/`reduce_installment` foram desenhados no Stage 2
e depois DROPADOS quando o modelo virou só-C6 — reintroduzir em `simulate.ts` +
`amortization.ts` + `schemas.ts` (`amortizationParamsSchema`) + as actions.

## Execução (grava)
- Cria 1 Transaction EXPENSE paga (o valor amortizado, na data, `loanId`) saindo
  da conta.
- **Prazo**: soft-delete das parcelas eliminadas do fim.
- **Prestação**: regenera as parcelas restantes com o novo valor.
- **Quitar**: reusa `settleLoan`.

## Enquanto não implementa
Botão "Simular antecipação" **desabilitado** no detalhe do financiamento (o
modelo só-C6 não serve pra casa). Reabilitar quando os 2 modelos estiverem prontos.
