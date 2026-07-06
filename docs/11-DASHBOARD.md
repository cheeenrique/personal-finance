# 11 - DASHBOARD.md

# Dashboard

O Dashboard é a tela principal da aplicação.

Ele deve responder instantaneamente à pergunta:

> "Como está minha vida financeira agora?"

---

# Objetivo

O Dashboard deve fornecer uma visão clara, rápida e consolidada de:

* resumo semanal automático
* alertas de anomalia e economia
* saldo atual
* receitas do mês
* despesas do mês
* previsto / a pagar (despesas ainda não pagas)
* gastos por categoria
* dívidas de cartão
* parcelamentos ativos
* patrimônio
* evolução financeira

Sem necessidade de navegação adicional.

---

# Regra Principal

O Dashboard deve ser compreensível em menos de 5 segundos.

Nenhuma informação essencial deve depender de scroll no desktop.

---

# Estrutura Geral

O Dashboard é dividido em 6 blocos:

```text
1. Resumo Semanal e Alertas
2. KPIs principais
3. Cartões e dívidas
4. Parcelamentos ativos
5. Gráficos e análises
6. Últimas transações
```

---

# 1. Resumo Semanal e Alertas

Primeiro bloco da tela, acima até dos KPIs mensais.

Ver `29-ALERTS.md` para as regras completas de geração (cron, baseline, thresholds).

## Box Resumo Semanal

Gerado todo domingo de manhã (08:00 America/Sao_Paulo). Janela de referência: domingo 00:00 → sábado 23:59 (America/Sao_Paulo).

O box fica visível do domingo de manhã (quando é gerado) até segunda-feira 14:00 (America/Sao_Paulo); fora dessa janela, some até o próximo domingo (ver `29-ALERTS.md`).

```text
📊 Resumo da semana (30/06 a 06/07)

Receitas: R$ 2.100,00
Despesas: R$ 1.450,00
Saldo: R$ 650,00

Top categorias:
1. Alimentação — R$ 480,00
2. Transporte — R$ 260,00
3. Lazer — R$ 210,00

Δ vs semana anterior: -12% em despesas
```

`TRANSFER` nunca entra nesse cálculo — mesma regra dos KPIs mensais (ver seção 2).

---

## Lista de Alertas Ativos

Logo abaixo do box semanal. Mostra alertas com `readAt = null`, mais recentes primeiro.

```text
⚠ Anomalia (laranja/vermelho) → gasto de categoria acima do baseline
✔ Verde (verde) → economia, orçamento respeitado ou saldo acima da média
```

Clicar num alerta marca `readAt` e o remove do destaque (não apaga, só sai da lista de ativos).

---

## Estado sem alertas

```text
Nenhum alerta novo esta semana. Continue assim!
```

---

# 2. KPIs Principais

Exibidos no topo da tela, logo abaixo do Resumo Semanal.

## Regras de Cálculo

```text
KPIs excluem transações TRANSFER
  → transferência não é receita nem despesa, é só movimentação entre contas

KPIs de "Despesas do mês" e "Saldo atual" excluem, por default,
despesas com isPaid = false
  → despesas pendentes entram no bloco "Previsto / A Pagar", separado

Todo valor monetário é Decimal, formatado como BRL na UI (R$ 0.000,00)
  → parse/format só na borda (ver 01-STACK.md)
```

## Cards obrigatórios

### Saldo Atual

```text
Total disponível (contas + carteira)

Ex: R$ 12.430
```

---

### Receitas do mês

```text
Total recebido no mês atual
```

---

### Despesas do mês

```text
Total gasto no mês atual (apenas isPaid = true, exclui TRANSFER)
```

---

### Previsto / A Pagar

```text
Total de despesas com isPaid = false no mês atual

Ex: R$ 380,00 previstos, ainda não pagos
```

Bloco separado dos KPIs de saldo/despesa — não impacta "Saldo Atual" nem "Despesas do mês" até a despesa ser marcada como paga.

---

### Resultado do mês

```text
Receitas - Despesas
```

Pode ser positivo ou negativo.

---

### Patrimônio Total

```text
Soma de:

- contas
- investimentos
- assets
```

---

# 3. Cartões e Dívidas

Exibe visão de todos os cartões.

Cada cartão mostra:

```text
Nome do cartão

Limite total

Limite utilizado

Limite disponível

Valor da fatura atual

Barra de progresso
```

---

## Exemplo visual

```text
Nubank

████████░░  78%

R$ 3.200 / R$ 4.000
```

---

## Ações

* clicar abre detalhes do cartão
* ver faturas anteriores
* ver transações do cartão

---

# 4. Parcelamentos Ativos

Exibe compras parceladas como progresso.

Nunca exibir parcelas como linhas separadas.

## Exemplo

```text
MacBook Pro

████░░░░░░

4 / 10 parcelas

R$ 5.944 pagos

R$ 8.916 restantes
```

---

## Informações

* parcelas restantes
* valor total
* próxima parcela

---

## Ações rápidas

* +1 parcela paga
* abrir detalhes

---

# 5. Gráficos e Análises

## Gastos por categoria

Gráfico de pizza ou barras.

Categorias principais:

* Alimentação
* Casa
* Carro
* Lazer
* Saúde
* Outros

---

## Evolução mensal

Linha temporal:

```text
Receitas vs Despesas últimos meses
```

---

## Fluxo de caixa

Mostra entradas e saídas ao longo do tempo.

---

# 6. Últimas Transações

Tabela compacta.

## Campos

* descrição
* valor
* categoria
* conta ou cartão
* data

---

## Ações

* editar
* excluir
* duplicar

---

# Ações Rápidas

Sempre visíveis no Dashboard:

```text
+ Nova Receita
+ Nova Despesa
+ Nova Transferência
+ Novo Cartão
+ Nova Conta
```

---

# Pesquisa Global

Disponível no topo:

```text
Ctrl + K
```

Permite buscar:

* transações
* cartões
* contas
* categorias
* tags
* patrimônio

---

# Estados do Dashboard

## Loading

Skeleton em toda a tela.

---

## Empty State

Quando não houver dados:

```text
Nenhuma movimentação ainda.

[ Criar primeira transação ]
```

---

## Erro

Mensagem simples:

```text
Não foi possível carregar o dashboard.
```

---

# Regras de Performance

O Dashboard deve:

* carregar rápido
* usar queries agregadas
* evitar múltiplas chamadas desnecessárias
* priorizar Server Components

---

# Responsividade

## Desktop

* visão completa
* todos os cards visíveis sem scroll

## Mobile

* layout em coluna
* cartões empilhados
* gráficos simplificados

---

# Parcelamentos no Dashboard

Parcelamentos são tratados como:

* 1 card por compra
* progresso visual
* ação rápida (+1 parcela)

Nunca mostrar parcelas individualmente aqui.

---

# Cartões no Dashboard

Sempre mostrar:

* limite total
* limite usado
* fatura atual

Nunca mostrar histórico completo aqui.

---

# Regra de Ouro

O Dashboard não é uma página de exploração.

É uma página de **consciência financeira instantânea**.

Ele deve responder:

* quanto tenho?
* quanto devo?
* quanto gastei?
* como estou?

Sem navegação adicional.
