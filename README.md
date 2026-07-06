# Finanças Pessoais

Painel de consciência financeira pessoal para 2 usuários (dono + esposa), com isolamento completo de dados por `userId`. Sem cadastro público, sem multiusuário/SaaS.

Ver `docs/` para a especificação completa do produto (stack, arquitetura, banco de dados, design system, telas, etc).

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- shadcn/ui
- PostgreSQL + Prisma ORM
- Auth.js (Credentials provider)
- Zod para validação
- date-fns / date-fns-tz (timezone fixo `America/Sao_Paulo`)

## Como rodar

1. Instalar dependências:

   ```bash
   npm install
   ```

2. Copiar `.env.example` para `.env` e preencher as variáveis (ver `docs/10-AUTH.md`):

   ```bash
   cp .env.example .env
   ```

3. Subir um Postgres local (opcional, para dev):

   ```bash
   docker compose up -d
   ```

4. Rodar as migrations do Prisma (depois que os models existirem — ver `docs/03-DATABASE.md`):

   ```bash
   npx prisma migrate dev
   ```

5. Rodar em dev:

   ```bash
   npm run dev
   ```

Abrir [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção
- `npm run start` — roda o build de produção
- `npm run lint` — ESLint
- `npm run format` — Prettier (`--write .`)

## Documentação

Toda a especificação do produto vive em [`docs/`](./docs), começando por [`docs/99-CLAUDE.md`](./docs/99-CLAUDE.md) (estrutura de pastas e convenções) e [`docs/01-STACK.md`](./docs/01-STACK.md) (stack técnica).
