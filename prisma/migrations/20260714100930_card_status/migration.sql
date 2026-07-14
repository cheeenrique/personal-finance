-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'BLOCKED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE';

-- Backfill: cartão hoje inativo (isActive=false) vira BLOCKED — não dá pra
-- distinguir BLOCKED de CANCELLED a partir do dado legado (só existia
-- isActive=false), então assume o estado menos destrutivo (BLOCKED, reversível
-- pela UI) em vez de CANCELLED.
UPDATE "Card" SET "status" = 'BLOCKED' WHERE "isActive" = false;
