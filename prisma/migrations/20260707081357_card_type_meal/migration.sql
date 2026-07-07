-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('CREDIT', 'MEAL');

-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "type" "CardType" NOT NULL DEFAULT 'CREDIT';
