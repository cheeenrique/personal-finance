-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkCode" TEXT,
ADD COLUMN     "telegramLinkCodeExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_telegramChatId_key" ON "UserSettings"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_telegramLinkCode_key" ON "UserSettings"("telegramLinkCode");
