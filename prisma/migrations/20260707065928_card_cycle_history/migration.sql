-- CreateTable
CREATE TABLE "CardCycle" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardCycle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardCycle_cardId_effectiveFrom_idx" ON "CardCycle"("cardId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "CardCycle" ADD CONSTRAINT "CardCycle_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
