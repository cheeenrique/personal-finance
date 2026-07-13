@AGENTS.md

# Finanças Pessoais

Convenções e arquitetura do projeto vivem em `docs/`, não neste arquivo. Ler
sempre antes de mexer no código:

- `docs/99-CLAUDE.md` — estrutura de pastas, convenção de código, regra de ouro (lógica de domínio só em `modules/`)
- `docs/01-STACK.md` — stack técnica e arquitetura
- `docs/03-DATABASE.md` — schema do banco (Prisma)
- `docs/04-DESIGN_SYSTEM.md` — design system e tokens
- `docs/10-AUTH.md` — autenticação e isolamento por `userId`

Regras duras (auto-carregadas no pre-flight, sobrescrevem best-practice genérica):

- `.claude/rules/01-server-components-data.md` — data fetching e streaming em Server Components (fronteiras Suspense, best-effort fora do caminho crítico, timeout de I/O externo)

Regra de ouro do projeto: se a lógica não estiver em `src/modules/`, ela não é regra de negócio válida — Server Actions/Route Handlers só delegam.
