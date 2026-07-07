-- CreateTable
CREATE TABLE "TelegramPendingEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "draftJson" JSONB NOT NULL,
    "missingField" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramPendingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPendingEntry_userId_key" ON "TelegramPendingEntry"("userId");

-- AddForeignKey
ALTER TABLE "TelegramPendingEntry" ADD CONSTRAINT "TelegramPendingEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
