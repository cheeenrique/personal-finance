# 98 - ROADMAP.md

# Roadmap de Implementação

Este documento define a ordem de construção do sistema.

O objetivo é garantir execução simples, incremental e funcional desde o primeiro deploy.

---

# Fase 1 - Fundação

## 1. Setup do projeto

* Next.js (App Router)
* Tailwind
* Auth.js
* PostgreSQL + Prisma
* Deploy (Vercel ou Railway)

---

## 2. Autenticação

* Login (credentials, 2 usuários via seed/allowlist)
* Middleware
* Sessão
* Proteção de rotas

---

## 3. Estrutura base

* Layout (sidebar + header)
* Design System
* UX Rules

---

# Fase 2 - Core Financeiro

## 4. Transactions

* CRUD completo
* filtros
* tabela
* integração com categorias

---

## 5. Accounts

* criação de contas
* saldo (derivado de transactions)
* impacto em transações

---

## 6. Categories

* árvore hierárquica
* obrigatórias nas transações

---

## 7. Tags

* criação livre
* associação com transações

---

## 8. Recurring Transactions

* cadastro de recorrência (aluguel, assinaturas)
* geração automática de transactions via cron
* baseline para detecção de anomalia

---

# Fase 3 - Cartões e Dívidas

## 9. Credit Cards

* criação de cartões
* limite
* cálculo de fatura
* integração com transactions

---

## 10. Installments

* parcelamentos (InstallmentPurchase + Transactions)
* progresso visual
* +1 parcela rápida

---

# Fase 4 - Controle Financeiro

## 11. Budgets

* orçamento mensal
* comparação planejado vs realizado (derivado)

---

## 12. Assets

* patrimônio
* visão acumulada
* histórico via AssetSnapshot

---

# Fase 5 - Visualização

## 13. Dashboard

* KPIs principais
* gráficos
* cartões
* parcelamentos
* últimas transações

---

## 14. Alertas / Resumo Semanal

* resumo semanal automático (box no topo do Dashboard)
* detecção de anomalia por categoria
* alerta verde de economia
* thresholds configuráveis em Settings

---

## 15. Reports

* análises completas
* filtros
* exportação (CSV)

---

# Fase 6 - Automação leve

## 16. Telegram

* registro rápido
* consultas
* resumo semanal (opcional via Telegram)

---

# Fase 7 - Refinamento

* performance
* otimizações de queries
* UX polish
* responsividade total

---

# Ordem de Valor

Prioridade real de impacto:

```text id="p1k8qp"
Transactions
Dashboard
Accounts
Cards
Budgets
Installments
Recurring Transactions
Alertas / Resumo Semanal
Reports
Telegram
```

---

# Regra Principal

Nada deve ser construído fora dessa ordem sem justificativa.

---

# Filosofia

Primeiro funciona.

Depois melhora.

Depois escala.

Nunca o contrário.
