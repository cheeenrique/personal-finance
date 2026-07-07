-- CreateEnum
CREATE TYPE "InterestPeriod" AS ENUM ('ANNUAL', 'MONTHLY');

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "interestPeriod" "InterestPeriod",
ADD COLUMN     "interestRate" DECIMAL(9,6);
