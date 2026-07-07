-- CreateTable
CREATE TABLE "CardInvoice" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardInvoice_cardId_dueDate_idx" ON "CardInvoice"("cardId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CardInvoice_cardId_year_month_key" ON "CardInvoice"("cardId", "year", "month");

-- AddForeignKey
ALTER TABLE "CardInvoice" ADD CONSTRAINT "CardInvoice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
