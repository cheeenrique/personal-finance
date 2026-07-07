-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramBotUsername" TEXT,
ADD COLUMN     "telegramWebhookRegistered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramWebhookSecret" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_telegramWebhookSecret_key" ON "UserSettings"("telegramWebhookSecret");

