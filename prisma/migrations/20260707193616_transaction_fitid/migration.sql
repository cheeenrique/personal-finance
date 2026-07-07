-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "fitId" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_accountId_fitId_idx" ON "Transaction"("accountId", "fitId");
