-- CreateEnum
CREATE TYPE "YieldBenchmark" AS ENUM ('NONE', 'CDI');

-- CreateEnum
CREATE TYPE "MarketIndex" AS ENUM ('CDI');

-- CreateEnum
CREATE TYPE "MarketIndexQuoteSource" AS ENUM ('GEMINI', 'MANUAL');

-- AlterTable Asset
ALTER TABLE "Asset" ADD COLUMN "yieldBenchmark" "YieldBenchmark" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Asset" ADD COLUMN "yieldPercentOfBenchmark" DECIMAL(7,2);

-- AlterTable Transaction
ALTER TABLE "Transaction" ADD COLUMN "assetId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "yieldPercentOfBenchmark" DECIMAL(7,2);

-- CreateTable
CREATE TABLE "MarketIndexQuote" (
    "id" TEXT NOT NULL,
    "index" "MarketIndex" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "annualRatePercent" DECIMAL(7,4) NOT NULL,
    "source" "MarketIndexQuoteSource" NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketIndexQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_userId_type_idx" ON "Asset"("userId", "type");

-- CreateIndex
CREATE INDEX "Transaction_userId_assetId_idx" ON "Transaction"("userId", "assetId");

-- CreateIndex
CREATE INDEX "MarketIndexQuote_index_date_idx" ON "MarketIndexQuote"("index", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MarketIndexQuote_index_date_key" ON "MarketIndexQuote"("index", "date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
