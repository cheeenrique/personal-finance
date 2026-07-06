# 10 - AUTH.md

# Autenticação e Sessão

Este documento define toda a estrutura de autenticação da aplicação.

O sistema é usado por exatamente 2 usuários confiáveis (dono + esposa), com isolamento completo de dados por userId. Não é multiusuário/SaaS — segurança proporcional ao contexto.

---

# Objetivo

Permitir que usuários:

* façam login
* permaneçam autenticados
* tenham seus dados isolados
* façam logout com segurança

---

# Estratégia de Autenticação

Será utilizado:

* Auth.js (NextAuth), provider `Credentials`

Autenticação baseada em:

* Email + senha

OAuth (Google/GitHub) está **fora de escopo (YAGNI)** — sem caller real para múltiplos provedores com 2 usuários fixos. Ver seção "Fora de Escopo".

---

# Fluxo de Autenticação

## Provisionamento de Usuários

Não existe cadastro público (`/register`). Os 2 usuários são criados previamente via `prisma db seed` (ou allowlist de emails validada dentro de `authorize()`). Login é sempre `credentials` (email + senha) para uma conta já existente.

```text
Dev roda `prisma db seed`

↓

Usuários (dono + esposa) criados com senha hashada (bcrypt)

↓

Cada um faz login com email + senha
```

---

## Login

```text
Usuário

↓

Email + senha

↓

Validação

↓

Sessão criada

↓

Redirecionado para Dashboard
```

---

## Rate Limiting

5 tentativas por minuto, por combinação IP + email. Implementação leve, sem Redis: contador em memória (single instance) ou tabela Postgres (`LoginAttempt`) se rodar múltiplas instâncias. Ao estourar o limite, bloquear novas tentativas por 1 minuto e responder genérico ("credenciais inválidas ou muitas tentativas"), sem revelar qual campo errou.

---

## Logout

```text
Usuário

↓

Clique em logout

↓

Sessão encerrada

↓

Redirecionado para login
```

---

# Proteção de Rotas

Todas as rotas da aplicação são protegidas.

Exceto:

* /login

---

# Middleware

O middleware será responsável por:

* verificar autenticação
* redirecionar usuários não autenticados
* evitar acesso direto ao dashboard sem login

---

# Estrutura de Sessão

A sessão deve conter:

```text
user:

- id
- name
- email
- image
```

---

# Regra Principal de Segurança

Nenhuma consulta ao banco pode ser feita sem:

userId da sessão

Exemplo obrigatório:

```sql
WHERE userId = session.user.id
```

Todo ID de entidade usa `cuid()` (não sequencial, não enumerável) — reforça a mitigação de IDOR junto do filtro por `userId`. Mesmo que um ID vaze ou seja adivinhado, o filtro `WHERE userId` bloqueia acesso cross-user.

---

# Usuário

Após login, o usuário representa o contexto principal da aplicação.

Todo dado pertence ao usuário logado.

---

# Onboarding (Primeiro Acesso)

No primeiro login:

```text
1. Boas-vindas

↓

2. Criar conta principal

↓

3. Criar cartão (opcional)

↓

4. Criar categorias padrão

↓

5. Ir para Dashboard
```

---

# Estados de Autenticação

## Não autenticado

Acesso permitido apenas a:

* Login

---

## Autenticado

Acesso completo à aplicação.

---

## Sessão expirada

Redirecionar automaticamente para login.

---

# Persistência de Sessão

Cookie de sessão:

* `httpOnly` — inacessível via JS no cliente
* `secure` — só trafega em HTTPS
* `sameSite=lax` — mitiga CSRF básico
* `maxAge`: 30 dias

Renovação automática via refresh token está fora de escopo — ver "Fora de Escopo (YAGNI)".

---

# Segurança

## Senha

* nunca armazenar em texto puro
* usar hash seguro (bcrypt ou equivalente)

---

## Dados

* sempre validar no backend
* nunca confiar em input do cliente

---

# Perfil do Usuário

Cada usuário pode:

* alterar nome
* alterar avatar
* alterar senha
* atualizar preferências

---

# Integração com Banco de Dados

Todas as entidades possuem:

```text
userId
```

Obrigatório para isolamento.

---

# Fluxo Geral da Aplicação

```text
Usuário não autenticado

↓

Login

↓

Sessão criada

↓

Middleware valida

↓

Onboarding (primeiro login)

↓

Dashboard
```

---

# Regras de Logout

Ao fazer logout:

* limpar sessão
* limpar cache local
* redirecionar para login

---

# Fora de Escopo (YAGNI)

Cortado deliberadamente — sem caller real para 2 usuários fixos:

* OAuth (Google/GitHub)
* múltiplos dispositivos / sessões simultâneas geridas individualmente
* refresh tokens
* revogação de sessão por dispositivo

Se um dia isso virar produto multiusuário, revisitar.

---

# Variáveis de Ambiente

Obrigatórias, nunca commitadas (`.env` fora do git) e nunca hardcoded no código:

* `AUTH_SECRET` — chave de assinatura de sessão do Auth.js
* `AUTH_URL` — base URL do Auth.js no deploy (ex.: `https://app.dominio.com`)
* `DATABASE_URL` — connection string do Postgres
* `TELEGRAM_BOT_TOKEN` — token do bot no Telegram
* `TELEGRAM_WEBHOOK_SECRET` — validado contra o header `X-Telegram-Bot-Api-Secret-Token` em toda request do webhook
* `TELEGRAM_ALLOWED_CHAT_IDS` — allowlist dos 2 chat_ids autorizados, mapeados para userId
* `CRON_SECRET` — valida o header `Authorization: Bearer` no cron de alertas (`/api/cron/weekly-summary`, ver `29-ALERTS.md`)
* `SEED_USER1_EMAIL`, `SEED_USER1_PASSWORD`, `SEED_USER1_NAME` — credenciais do usuário 1 (dono), lidas por `prisma db seed` para criar a conta com senha hashada (bcrypt)
* `SEED_USER2_EMAIL`, `SEED_USER2_PASSWORD`, `SEED_USER2_NAME` — credenciais do usuário 2 (esposa), mesmo fluxo do seed

---

# Filosofia

Autenticação deve ser invisível no uso diário.

O usuário só deve perceber login uma vez.

Depois disso, o sistema simplesmente funciona.
