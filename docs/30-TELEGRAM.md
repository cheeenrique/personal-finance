# 30 - TELEGRAM.md

# Integração com Telegram

Este módulo permite registrar e consultar informações financeiras diretamente pelo Telegram.

Ele funciona como uma interface rápida do sistema principal.

---

# Objetivo

Permitir que o usuário:

* registre transações rapidamente via mensagem
* consulte gastos e saldo
* receba resumos automáticos
* interaja sem abrir o sistema web

---

# Regra Principal

O Telegram é uma interface alternativa.

Ele nunca substitui o sistema principal.

Ele apenas acelera entradas e consultas.

---

# Endpoint

Webhook exposto em `POST /api/telegram` (Route Handler — exceção ao padrão Server Actions do app, junto com os crons). Recebe o update do Telegram, valida o secret do header, processa e responde.

---

# Fluxo de Uso

## Registro de gasto

```text id="t1k8qp"
Usuário envia:

mercado 120
```

Sistema interpreta:

* tipo: EXPENSE
* valor: 120
* categoria: Alimentação (inferida)

````

---

## Registro com categoria explícita

```text id="c3v8qp"
almoço 45 restaurante
````

---

## Registro com tag

```text id="m7k2qp"
uber 30 trabalho
```

---

## Receita

```text id="r4v8qp"
salário 5000
```

---

# Estrutura de Interpretação

Sistema deve interpretar mensagens com base em:

```text id="i2k7qp"
valor numérico

palavras-chave

contexto histórico do usuário

categorias mais usadas

tags existentes
```

---

# Regras de Parsing

## Regra 1

Se houver número → é valor obrigatório

---

## Regra 2

Se não houver categoria → inferir automaticamente. Se a inferência for ambígua ou não reconhecer nada, cai em fallback: categoria **"Outros"** — nunca fica sem categoria.

---

## Regra 3

Se não houver data → usar data atual

---

## Regra 4

Se houver múltiplas palavras → primeira é descrição

---

# Comandos

## Nova transação

```text id="n1v8qp"
mercado 120
```

---

## Consulta de saldo

```text id="s3k9qp"
saldo
```

---

## Gastos do mês

```text id="g7m2qp"
gastos mes
```

---

## Resumo diário

```text id="d4v8qp"
hoje
```

---

# Respostas do Bot

## Confirmação de transação

```text id="c2k8qp"
✔ Gasto registrado

Mercado - R$ 120
Categoria: Alimentação
```

Confirmação inline por botão (ex.: trocar categoria antes de salvar) é opcional, não obrigatória no MVP.

---

## Resumo

```text id="r7v2qp"
📊 Gastos do mês

Alimentação: R$ 1.200
Carro: R$ 400
Casa: R$ 800

Total: R$ 2.400
```

---

# Integração com Sistema

Todas as mensagens criam ou consultam:

* Transactions
* Categories
* Tags
* Accounts
* Cards

---

# Segurança

* **Allowlist fixa** via env `TELEGRAM_ALLOWED_CHAT_IDS` — mapeia os 2 `chat_id` autorizados para o `userId` correspondente. Mensagem de `chat_id` fora da lista: **rejeitar silenciosamente** (sem responder — não confirma ao remetente que o bot existe).
* **Validação do webhook:** toda request em `/api/telegram` valida o header `X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET` (configurado no `setWebhook`) antes de processar. Sem o header correto → descarta.
* **Logs:** nunca logar corpo da mensagem nem valores monetários — só `chat_id` + resultado (ex.: `chat_id=123 -> transaction_created`).

---

# Limitações

* não suporta edição complexa
* não substitui dashboard
* não substitui relatórios

---

# UX Principal

O objetivo é:

> registrar gasto em menos de 5 segundos

---

# Casos de Uso

## Caso 1

Usuário no mercado:

```text id="u1k8qp"
"mercado 85"
```

---

## Caso 2

Pagamento rápido:

```text id="p7v2qp"
"uber 25 trabalho"
```

---

## Caso 3

Receita:

```text id="r3m8qp"
"freela 800"
```

---

# Regras de Negócio

## Regra 1

Toda mensagem com valor numérico gera transação.

---

## Regra 2

Toda transação criada via Telegram segue mesmas regras do sistema principal.

---

## Regra 3

Telegram não pode criar dados inconsistentes.

---

# Performance

* respostas devem ser instantâneas
* processamento leve
* sem dependência de UI

---

# Evolução Futura

* comandos mais inteligentes
* notificações de orçamento
* alertas de cartão
* resumo semanal automático

---

# Filosofia

O Telegram é a “entrada rápida” do sistema financeiro.

Ele remove fricção.

Ele substitui a necessidade de abrir o app para pequenas ações.
