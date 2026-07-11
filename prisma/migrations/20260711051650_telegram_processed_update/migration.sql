-- CreateTable
CREATE TABLE "TelegramProcessedUpdate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramProcessedUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramProcessedUpdate_userId_updateId_key" ON "TelegramProcessedUpdate"("userId", "updateId");

-- CreateIndex
CREATE INDEX "TelegramProcessedUpdate_createdAt_idx" ON "TelegramProcessedUpdate"("createdAt");

-- AddForeignKey
ALTER TABLE "TelegramProcessedUpdate" ADD CONSTRAINT "TelegramProcessedUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
