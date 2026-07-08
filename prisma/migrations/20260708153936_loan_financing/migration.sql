-- CreateEnum
CREATE TYPE "LoanKind" AS ENUM ('LOAN', 'FINANCING');

-- CreateEnum
CREATE TYPE "AmortizationSystem" AS ENUM ('PRICE', 'SAC', 'CUSTOM');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "amortizationSystem" "AmortizationSystem",
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "assetValue" DECIMAL(12,2),
ADD COLUMN     "cet" DECIMAL(9,6),
ADD COLUMN     "downPayment" DECIMAL(12,2),
ADD COLUMN     "financedFees" DECIMAL(12,2),
ADD COLUMN     "financedInsurance" DECIMAL(12,2),
ADD COLUMN     "financedTaxes" DECIMAL(12,2),
ADD COLUMN     "kind" "LoanKind" NOT NULL DEFAULT 'LOAN',
ADD COLUMN     "operationRef" TEXT;

-- CreateIndex
CREATE INDEX "Loan_assetId_idx" ON "Loan"("assetId");

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
