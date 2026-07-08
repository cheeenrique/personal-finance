-- Unicidade de fitId por conta (docs/03-DATABASE.md, "Importação de Extrato
-- OFX"): dedup em nível de aplicação fura sob commit concorrente (duplo clique
-- no Confirmar — o snapshot de dedup não enxerga inserts não commitados do
-- concorrente). O índice único parcial abaixo é a garantia real; o app usa
-- `createMany({ skipDuplicates: true })` pra violação virar no-op.

-- 1) Dedup de linhas pré-existentes: double-imports antigos podem ter criado
--    mais de uma Transaction VIVA com o mesmo (accountId, fitId) — o CREATE
--    UNIQUE INDEX abaixo falharia. Soft-delete (padrão do app, nunca DELETE
--    físico) das excedentes, mantendo a de menor id em cada grupo. Linhas com
--    accountId NULL não são tocadas (`accountId = NULL` nunca casa no
--    subselect; fitId só nasce em importação, que exige conta).
UPDATE "Transaction" AS t
SET "deletedAt" = NOW(),
    "updatedAt" = NOW()
WHERE t."fitId" IS NOT NULL
  AND t."deletedAt" IS NULL
  AND t."id" <> (
    SELECT MIN(t2."id")
    FROM "Transaction" AS t2
    WHERE t2."accountId" = t."accountId"
      AND t2."fitId" = t."fitId"
      AND t2."deletedAt" IS NULL
  );

-- 2) Índice único PARCIAL — em SQL cru porque Prisma não modela `WHERE` em
--    unique (ver comentário do campo `fitId` no schema.prisma). O predicado
--    inclui `deletedAt IS NULL` de propósito: sem ele, as linhas soft-deleted
--    do passo 1 ainda ocupariam o índice (a criação falharia) e reimportar um
--    lançamento excluído ficaria impossível pra sempre.
CREATE UNIQUE INDEX "Transaction_accountId_fitId_key"
  ON "Transaction"("accountId", "fitId")
  WHERE "fitId" IS NOT NULL AND "deletedAt" IS NULL;
