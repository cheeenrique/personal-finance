# 01 — Server Components: Data Fetching & Streaming

Regra dura do projeto. Sobrescreve "best practice" genérica. Nasceu de bug real:
dashboard preso em skeleton >2min porque a narrativa via IA (best-effort, sem
SLA) dividia o mesmo `Promise.all` / `Suspense` das queries do Postgres — o
timeout+retry+fallback da IA (~128s) travava a tela inteira.

Reforça a Regra de Ouro (`docs/99-CLAUDE.md`) no nível de **rendering**: página só
compõe e orquestra; nunca deixa um fetch não-essencial refém do essencial.

---

## Litmus: onde cada fetch pode rodar

Antes de por qualquer `await`/`Promise.all` numa página ou Server Component,
classificar a fonte:

| Fonte do dado | Classe | Onde roda |
|---|---|---|
| Query do próprio Postgres via `repository` (latência previsível) | **crítico** | Pode entrar no `Promise.all` da fronteira |
| IA (`extractStructured`/Gemini/NVIDIA), HTTP externo, qualquer coisa sem SLA | **best-effort** | Suspense PRÓPRIO + timeout. NUNCA no barrier crítico |
| Dado cujo service pode retornar `null`/vazio como "falhou, tudo bem" | **best-effort** | idem acima |

Regra de bolso: **se o service modela falha como `null` (erro-como-dado), o dado é
best-effort — não pode gatear UI essencial.**

---

## Regras

### R1 — Uma fronteira Suspense por classe de latência + criticidade
Não misturar crítico e best-effort no mesmo `<Suspense>`. Cada `Suspense` tem UM
motivo pra estar carregando. Dados críticos (queries Postgres) num barrier;
cada best-effort (IA/externo) no seu próprio, com fallback skeleton local.

### R2 — Best-effort nunca no caminho crítico
Fetch que pode falhar sem quebrar a tela (retorna `null`/vazio) roda em Server
Component isolado sob `Suspense` próprio. O resto da página pinta sem esperar por
ele. Falha/lentidão dele degrada só a seção dele.

### R3 — I/O externo tem timeout dentro do budget de UX e roda isolado
Toda chamada de latência ilimitada (LLM, 3rd party) precisa de `AbortSignal`/timeout.
Cadeia de retry+fallback (ex.: `extract.ts`) NUNCA empilha no first paint —
sempre atrás de `Suspense` próprio. Somar os piores casos da cadeia < experiência
aceitável pra AQUELA seção, não pra página toda.

### R4 — `Promise.all` agrupa só a MESMA fronteira
`Promise.all` paraleliza I/O — bom. Mas um `Promise.all` gigante que resolve a
página inteira antes do primeiro pixel é smell: mistura fronteiras. Agrupar só os
fetches críticos que aquela fronteira precisa junta.

### R5 — Página/rota = composição + orquestração. Zero derivação de domínio
Reforço da Regra de Ouro. Proibido na página (`app/**/page.tsx`):
- `filter`/`map`/`reduce`/`slice`/`sort` com **semântica de negócio**
  (ex.: excluir `WEEKLY_SUMMARY`, filtrar `kind===LOAN`, fatiar meses decorridos).
  Isso é regra → vai pro `service`, exposto como método pronto pra consumir.

Permitido na página:
- Composição de componentes, leitura de `searchParams`, orquestração de fetch.
- Serialização de borda pura pra Client Component (ex.: `Decimal.toNumber()`),
  desde que sem decisão de domínio.

### R6 — Skeleton reflete o layout final, não um bloco cego
Fallback de `Suspense` de seção espelha a forma real daquela seção (altura/grid),
não um retângulo genérico que causa layout shift quando o conteúdo chega.

---

## Anti-pattern (o que causou o bug)

```tsx
// ❌ tudo num barrier, best-effort (IA) junto do crítico (Postgres)
async function DashboardContent() {
  const [saldo, kpis, ..., narrativaIA] = await Promise.all([
    accountService.totalBalance(userId),        // crítico ~ms
    // ... 14 queries Postgres ...
    insightsService.monthlyNarrative(userId, ...), // best-effort, ~128s no pior caso
  ]);
  return <>{/* nada pinta até a IA responder */}</>;
}
```

## Pattern correto

```tsx
// ✅ crítico no barrier; best-effort em Suspense próprio
export default async function Page({ searchParams }) {
  const period = parsePeriod((await searchParams).period);
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent period={period} />
    </Suspense>
  );
}

async function DashboardContent({ period }) {
  const [saldo, kpis, ...] = await Promise.all([ /* só queries Postgres */ ]);
  return (
    <>
      {/* seção best-effort isolada: falha/lentidão não trava o resto */}
      <Suspense fallback={<NarrativeSkeleton />}>
        <MonthlyNarrativeSection userId={userId} />
      </Suspense>
      <KPIGrid data={kpis} />
      {/* ... */}
    </>
  );
}

// Server Component dedicado — o await lento vive aqui, sozinho
async function MonthlyNarrativeSection({ userId }) {
  const narrative = await insightsService.monthlyNarrative(userId, y, m);
  return <MonthlyNarrativeCard narrative={narrative} />;
}
```

---

## Checklist (pré-commit em Server Component com fetch)

- [ ] Cada fetch classificado (crítico vs best-effort) pelo litmus acima.
- [ ] Nenhum best-effort (IA/externo/`null`-em-falha) no `Promise.all` crítico.
- [ ] Todo I/O externo tem timeout; cadeia retry/fallback atrás de `Suspense` próprio.
- [ ] Nenhum `filter`/`map`/`slice` de **domínio** na página — está no service.
- [ ] Skeleton de cada seção espelha o layout real.
