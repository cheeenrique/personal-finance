# 12 - SETTINGS.md

# Configurações

Este módulo concentra as preferências do usuário logado.

Cada um dos 2 usuários tem suas próprias configurações, totalmente isoladas.

---

# Objetivo

Permitir que o usuário:

* defina moeda e fuso horário
* escolha o tema (claro/escuro)
* ajuste a sensibilidade dos alertas automáticos
* veja o status da integração com o Telegram
* acesse rapidamente categorias e tags
* exporte seus dados e acesse o backup

---

# Regra Principal

Toda configuração pertence a um único usuário.

```text
UserSettings é 1:1 com User.
Nunca compartilhado entre os 2 usuários.
```

---

# Rota

```text
/settings
```

Acessível apenas autenticado, protegida pelo mesmo middleware das demais rotas (ver `10-AUTH.md`).

---

# Estrutura do UserSettings

```ts
id            // cuid
userId        // 1:1 com User

currency      // default "BRL"
timezone      // default "America/Sao_Paulo"
theme         // LIGHT | DARK | SYSTEM, default DARK

alertAnomalyMultiplier    // default 1.5
alertMinimumAmount        // Decimal, default 50.00
alertGreenMultiplier      // default 0.6

telegramChatId              // String? @unique — vínculo self-service confirmado
telegramLinkCode            // String? @unique — código de 6 chars, válido 15min
telegramLinkCodeExpiresAt   // DateTime?

createdAt
updatedAt
```

O vínculo do Telegram (`telegramChatId`) é 100% gerenciado pelo próprio usuário nesta tela — gera um código, confirma pelo bot, sem precisar editar `.env` (ver seção Telegram abaixo). Fallback legado via `TELEGRAM_ALLOWED_CHAT_IDS` (env var) continua existindo pro webhook, mas não é mais o caminho principal.

---

# Seções da Tela

```text
1. Preferências gerais (moeda, timezone, tema)
2. Alertas (thresholds)
3. Telegram (status do vínculo)
4. Categorias e Tags (atalho)
5. Dados (export CSV + backup)
```

---

# 1. Preferências Gerais

## Moeda

```text
BRL (default, único suportado no momento)
```

Campo existe pra abrir espaço futuro, mas hoje só BRL é aceito — sem multi-moeda real (YAGNI).

---

## Timezone

```text
America/Sao_Paulo (default e fixo)
```

Todo cálculo de data (semana, mês, fatura) usa esse timezone — ver `01-STACK.md`. Trocar aqui é só cosmético até o sistema suportar múltiplos fusos (não é o caso hoje).

---

## Tema

```text
Claro
Escuro
Sistema
```

Default: Escuro (`DARK`, ver `04-DESIGN_SYSTEM.md`). "Sistema" (`SYSTEM`) segue o tema do SO e é persistido como valor próprio em `UserSettings.theme` — não é só um estado de UI. Aplicado imediatamente, sem reload.

---

# 2. Alertas (Thresholds)

Configuração usada pelo cron de alertas (ver `29-ALERTS.md`).

## Campos

```text
alertAnomalyMultiplier  → default 1.5
alertMinimumAmount      → default R$ 50,00
alertGreenMultiplier    → default 0.6
```

## Explicação em tela

```text
Alerta de gasto fora do padrão dispara quando o gasto da semana
numa categoria passa de {alertAnomalyMultiplier}x a média
e é maior que R$ {alertMinimumAmount}.

Alerta de economia dispara quando o gasto fica abaixo de
{alertGreenMultiplier}x a média.
```

## Regra

Alterar esses valores só afeta as próximas execuções do cron semanal. Alertas já gerados não são recalculados.

---

# 3. Telegram

## Vínculo por código (self-service)

```text
Vinculado         → badge verde + chat_id: 123456789 + botão "Desvincular"
Não vinculado     → botão "Vincular Telegram" (gera código)
Código pendente   → código de 6 chars em destaque + instrução "/vincular <CODE>" + expiração
```

## Fluxo

1. Usuário clica "Vincular Telegram" → `generateTelegramLinkCodeAction` gera um código de 6 caracteres (charset sem `0/O/1/I`, `crypto.randomInt`), válido por **15 minutos**.
2. Usuário envia `/vincular <CODE>` (ou abre o deep-link `/start <CODE>`) pro bot no Telegram.
3. Webhook confirma o vínculo, gravando `telegramChatId` em `UserSettings` e limpando o código. A tela detecta a confirmação via polling curto (ou refresh manual) e atualiza para o estado "Vinculado".
4. Código expirado nunca é exibido como válido — expirar é tratado como "sem código pendente".

## Regras

* Gerar um novo código com um `chat_id` já vinculado é permitido — troca de celular é caso de uso legítimo (o vínculo antigo só é sobrescrito quando o novo código for confirmado).
* "Desvincular" (com confirmação, `ConfirmDialog`) limpa `telegramChatId` — para de receber notificações e lançar por lá até um novo vínculo.
* Fallback legado: `TELEGRAM_ALLOWED_CHAT_IDS` (env var) continua funcionando no webhook para setups antigos, mas não aparece nesta tela — é só um caminho de leitura no bot, nunca editável pela UI.

Ver `30-TELEGRAM.md` para o fluxo completo do bot.

---

# 4. Categorias e Tags (Atalho)

```text
[ Gerenciar categorias ]  → leva para 24-CATEGORIES.md
[ Gerenciar tags ]        → leva para 25-TAGS.md
```

Settings não duplica a UI de categorias/tags — é só um atalho de navegação.

---

# 5. Dados

## Export CSV

```text
[ Exportar transações (CSV) ]
```

Mesma exportação documentada em `28-REPORTS.md`, com atalho direto aqui para conveniência.

## Backup

```text
[ Ver informações de backup ]
```

Exibe texto explicando a estratégia de backup do provider (point-in-time recovery do Postgres gerenciado — Neon/Supabase/Railway) e, se aplicável, a data do último `pg_dump` manual. Ver `01-STACK.md` e `03-DATABASE.md` para detalhes técnicos.

---

# Estados

## Loading

Skeleton dos cards de seção.

---

## Erro

```text
Não foi possível carregar suas configurações.
```

---

## Salvo

```text
Configurações atualizadas.
```

Feedback inline (toast curto), sem reload de página.

---

# Regras de Negócio

## Regra 1

`UserSettings` é criado automaticamente no primeiro acesso do usuário (via seed ou lazy-create no primeiro `GET /settings`), sempre com os defaults (BRL, America/Sao_Paulo, thresholds default).

---

## Regra 2

Nenhuma configuração de um usuário é visível ou editável pelo outro.

---

## Regra 3

`chat_id` do Telegram não é editável diretamente — só é definido via confirmação do código de vínculo pelo bot (`/vincular <CODE>`/`/start <CODE>`). A UI só gera o código e desvincula; nunca escreve `telegramChatId` diretamente.

---

## Regra 4

Alterar timezone/moeda hoje é cosmético — o sistema só opera corretamente em BRL + America/Sao_Paulo (ver `01-STACK.md`). Documentado aqui pra não gerar expectativa de multi-moeda real.

---

# Performance

* tela simples, 1 registro por usuário — sem paginação, sem agregação pesada
* leitura direta do `UserSettings`, sem cache dedicado

---

# Integração com Sistema

Settings alimenta:

* Alerts (thresholds do cron semanal — `29-ALERTS.md`)
* Telegram (exibição do status de vínculo — `30-TELEGRAM.md`)
* Dashboard e Reports (moeda/timezone usados na formatação e nos cálculos de data)

---

# Filosofia

Settings não é o coração do sistema — é o painel de ajuste fino.

Poucas opções, direto ao ponto: o usuário deve conseguir ajustar o essencial (tema, sensibilidade de alerta, status do Telegram) sem se perder em configuração desnecessária.
