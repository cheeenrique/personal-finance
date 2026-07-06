# 29 - ALERTS.md

# Alertas e Insights

Este módulo gera avisos automáticos sobre a vida financeira do usuário, sem que ele precise abrir relatórios.

Ele transforma o sistema de passivo (o usuário precisa procurar) em ativo (o sistema avisa).

---

# Objetivo

Permitir que o usuário:

* receba um resumo semanal automático (receitas, despesas, saldo, top categorias)
* seja avisado quando um gasto foge do padrão numa categoria (anomalia)
* seja avisado quando está economizando ou indo bem (alerta verde)
* configure a sensibilidade desses avisos

---

# Regra Principal

Alertas nunca são criados manualmente pelo usuário.

Todo alerta é gerado automaticamente pelo sistema, a partir de agregações de Transactions + Settings.

```text
Alert é sempre derivado.
Alert nunca é fonte de verdade.
```

---

# Rota

Alertas aparecem em dois lugares:

* Dashboard (`11-DASHBOARD.md`): box "Resumo Semanal" + lista de alertas ativos (`readAt = null`)
* página `/alerts` (ver `06-SCREENS.md`): histórico completo, incluindo os já lidos, com filtro por tipo e por status de leitura

Opcionalmente, o resumo semanal também chega como mensagem no Telegram.

A única rota HTTP do módulo é o cron (`/api/cron/weekly-summary`), descrito abaixo. Tanto o Dashboard quanto `/alerts` leem os dados via Server Component, sem rota HTTP própria.

---

# Estrutura do Alert

```ts
id            // cuid
userId

type          // WEEKLY_SUMMARY | ANOMALY | GREEN
severity      // INFO | WARN | GOOD

title
message

payload       // json - números já calculados (evita reprocessar no frontend)

readAt        // nullable - quando o usuário visualizou
createdAt
```

---

# Tipos de Alerta

## WEEKLY_SUMMARY

Resumo automático da semana. Severity `INFO`. Gerado sempre, uma vez por semana, por usuário.

---

## ANOMALY

Gasto de uma categoria fora do padrão. Severity `WARN`. Gerado por categoria, só quando a condição dispara.

---

## GREEN

Sinal positivo (economia, orçamento respeitado, saldo acima da média). Severity `GOOD`. Gerado por categoria ou pela semana, só quando a condição dispara.

---

# Resumo Semanal (objetivo-chave)

## Janela de Tempo

```text
Domingo 00:00 → Sábado 23:59
Timezone: America/Sao_Paulo
```

Semana sempre fechada (não é a semana corrente, é a que acabou de terminar).

---

## O que agrega

* total de receitas da semana
* total de despesas da semana
* saldo da semana (receitas - despesas)
* top 3 categorias de gasto
* comparação com a semana anterior (Δ%)

`TRANSFER` nunca entra nesses totais — mesma regra de `28-REPORTS.md` e `11-DASHBOARD.md`.

---

## Geração

Cron rodando domingo de manhã (08:00 America/Sao_Paulo), chamando:

```text
/api/cron/weekly-summary
```

---

## Exibição

* box no topo do Dashboard
* opcional: mesma mensagem enviada por Telegram

---

## Janela de exibição

O box "Resumo Semanal" fica visível do domingo de manhã (quando é gerado) até segunda-feira 14:00 (`America/Sao_Paulo`) — cerca de 30h de janela.

```text
visível enquanto: agora < segunda-feira 14:00 seguinte à geração
fora disso: box some até o próximo domingo
```

Regra vale só pro box de resumo semanal (`WEEKLY_SUMMARY`). Alertas de anomalia e verde são independentes: persistem até serem lidos (`readAt`), não seguem essa janela.

---

## Exemplo

```text
📊 Resumo da semana (30/06 a 06/07)

Receitas: R$ 2.100
Despesas: R$ 1.450
Saldo: R$ 650

Top categorias:
1. Alimentação — R$ 480
2. Transporte — R$ 260
3. Lazer — R$ 210

Δ vs semana anterior: -12% em despesas
```

---

# Anomalia de Gasto (objetivo-chave)

## Baseline

Média de gasto das últimas 8 semanas, por categoria. Exclui a semana atual do cálculo.

```text
baseline = média(gasto da categoria nas últimas 8 semanas)
```

---

## Condição de Disparo

Dispara `WARN` quando **ambas** as condições forem verdadeiras:

```text
gasto_semana_atual > baseline * alertAnomalyMultiplier   (default 1.5)
E
gasto_semana_atual > alertMinimumAmount                   (default R$ 50)
```

Campos em `UserSettings` (ver `12-SETTINGS.md`).

O mínimo absoluto existe pra evitar ruído: categoria com baseline de R$ 10 não deve gerar alerta por gastar R$ 20.

---

## Cor e Severidade

* Severity: `WARN`
* Cor: laranja (perto do limite) ou vermelho (bem acima do baseline)

---

## Exemplo

```text
⚠ Gasto fora do padrão

Alimentação: R$ 850 esta semana
Média das últimas 8 semanas: R$ 400

83% acima do normal.
```

---

# Alerta Verde - Economia (objetivo-chave)

## Condições de Disparo

Dispara `GOOD` quando **qualquer uma** for verdadeira:

```text
(a) gasto_semana_categoria < baseline * alertGreenMultiplier  (default 0.6)

(b) mês fechou ABAIXO do orçamento da categoria (ver 26-BUDGETS.md)

(c) saldo_semana > média do saldo das últimas 8 semanas
```

---

## Cor e Severidade

* Severity: `GOOD`
* Cor: verde

---

## Exemplo

```text
✔ Você economizou

Lazer: R$ 120 esta semana
Média das últimas 8 semanas: R$ 300

60% abaixo do normal.
```

---

# Thresholds Configuráveis

Definidos pelo usuário em Settings, campos de `UserSettings` (`12-SETTINGS.md`, `03-DATABASE.md`):

```text
alertAnomalyMultiplier   → default 1.5
alertMinimumAmount       → default R$ 50,00
alertGreenMultiplier     → default 0.6
```

Alterar esses valores muda a sensibilidade dos alertas para as próximas execuções do cron. Alertas já gerados não são recalculados.

---

# Cron Job

## Rota

```text
GET /api/cron/weekly-summary
```

Route Handler — exceção documentada em `99-CLAUDE.md`: Server Actions são o padrão para mutations do app, mas crons e o webhook do Telegram usam Route Handler porque são chamados por um agente externo (Vercel Cron / Railway Cron / Telegram), não pelo navegador do usuário.

---

## Agendamento

**Vercel:**

```text
vercel.json → crons: [{ path: "/api/cron/weekly-summary", schedule: "0 11 * * 0" }]
```

Domingo 08:00 America/Sao_Paulo = 11:00 UTC (Vercel Cron roda em UTC).

**Railway:**

```text
Cron nativo do serviço, mesmo schedule, mesma rota.
```

Ambos viáveis; a rota e a lógica são idênticas, só muda quem dispara.

---

## Proteção

```text
Header: Authorization: Bearer <CRON_SECRET>
```

`CRON_SECRET` vem de env var. Requisição sem o header correto → `401`, nada é processado. Nunca expor essa rota sem validação.

---

## O que o cron faz

```text
1. Para cada um dos 2 usuários:

2. Calcula a janela da semana que acabou de fechar

3. Agrega receitas, despesas, saldo, top 3 categorias, Δ vs semana anterior

4. Roda o algoritmo de anomalia por categoria

5. Roda o algoritmo de alerta verde

6. Persiste os Alerts:
   - 1 WEEKLY_SUMMARY sempre
   - 1 ANOMALY por categoria que disparou
   - 1 GREEN por categoria/condição que disparou

7. Se integração Telegram ativa, envia o resumo semanal como mensagem
```

---

# Persistência e Leitura

* Todo alerta gerado é um `INSERT` em `Alert`, com `readAt = null`.
* O Dashboard lista alertas com `readAt = null` em destaque.
* Ao abrir/expandir um alerta (ou clicar em "marcar como lido"), o sistema faz `UPDATE Alert SET readAt = now()`.
* Alertas não são apagados ao serem lidos — só saem do destaque do Dashboard. Ficam disponíveis no histórico completo em `/alerts` (`06-SCREENS.md`).
* Não há exclusão automática de alertas antigos (soft, sem job de limpeza por enquanto — YAGNI).

---

# Interface no Dashboard

```text
[ Box Resumo Semanal — topo da página ]

[ Lista de Alertas Ativos ]
  - anomalia (vermelho/laranja)
  - verde (verde)
```

Ver `11-DASHBOARD.md` para o layout completo. Histórico completo (incluindo já lidos) fica em `/alerts`, ver `06-SCREENS.md`.

---

# Estados

## Loading

Skeleton do box de resumo e da lista de alertas.

---

## Empty

```text
Nenhum alerta novo esta semana. Continue assim!
```

---

## Erro

```text
Não foi possível carregar os alertas.
```

---

# Performance

* cron roda uma vez por semana, volume de 2 usuários — processamento trivial
* agregações direto no Postgres, sem camada de cache dedicada (sem Redis)
* `payload` guarda os números já calculados no momento da geração, evitando reprocessar no frontend

---

# Integração com Sistema

Alerts utilizam:

* Transactions (fonte de todos os agregados)
* Categories (baseline por categoria)
* Budgets (condição de alerta verde por orçamento)
* Settings (thresholds configuráveis)
* Telegram (envio opcional do resumo semanal)

---

# Regras de Negócio

## Regra 1

Alerta nunca é criado manualmente pelo usuário.

---

## Regra 2

Alerta é sempre derivado de Transactions + Settings, nunca fonte de verdade.

---

## Regra 3

Marcar como lido não apaga o alerta, só remove do destaque.

---

## Regra 4

`TRANSFER` nunca entra em nenhuma agregação de alerta — mesma regra de Reports e Dashboard.

---

## Regra 5

Alterar thresholds em Settings só afeta execuções futuras do cron, nunca recalcula alertas já gerados.

---

# Filosofia

O sistema não deve depender do usuário lembrar de olhar.

Ele deve avisar: "presta atenção aqui" quando algo sai do padrão, e "continue assim" quando algo vai bem.

Alertas fecham o loop entre dado e decisão — sem isso, o sistema é só um registro.
