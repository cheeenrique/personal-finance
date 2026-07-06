import { NextResponse, type NextRequest } from "next/server";
import { resolveUserId } from "@/modules/telegram/allowlist";
import { isValidWebhookSecret } from "@/modules/telegram/webhook-auth";
import { telegramParser } from "@/modules/telegram/parser";
import { telegramHandlers } from "@/modules/telegram/handlers";
import { telegramApi } from "@/modules/telegram/telegram-api";

const WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token";

type TelegramUpdate = {
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
};

/**
 * Webhook do Telegram — exceção documentada ao padrão Server Actions
 * (docs/99-CLAUDE.md, docs/30-TELEGRAM.md "Endpoint"): chamado pelo Telegram,
 * não pelo navegador do usuário — sem `auth()` de sessão. Segurança é via
 * secret de header + allowlist de chat_id.
 *
 * Sempre responde 200 rápido pro Telegram — inclusive na rejeição
 * silenciosa (chat_id fora da allowlist) — pra nunca deixar o Telegram
 * re-tentar a entrega por timeout nem revelar ao remetente desconhecido que
 * o bot existe.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const secretHeader = request.headers.get(WEBHOOK_SECRET_HEADER);
  if (!isValidWebhookSecret(secretHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text;

  if (chatId === undefined || chatId === null || !text) {
    return NextResponse.json({ ok: true });
  }

  const userId = resolveUserId(chatId);
  if (!userId) {
    // Rejeição silenciosa (docs/30-TELEGRAM.md, "Segurança"): 200 vazio, sem
    // processar nem responder ao remetente.
    console.log(`chat_id=${chatId} -> rejected_unauthorized`);
    return NextResponse.json({ ok: true });
  }

  const command = telegramParser.parseMessage(text);
  const result = await telegramHandlers.executeCommand(userId, command);
  await telegramApi.sendMessage(chatId, result.text);

  // Log só chat_id + resultado — nunca corpo da mensagem nem valores (docs/30-TELEGRAM.md, "Segurança").
  console.log(`chat_id=${chatId} -> ${result.resultCode}`);

  return NextResponse.json({ ok: true });
}
