"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { cardService } from "./service";
import { payInvoice } from "./pay-invoice";
import {
  createCardSchema,
  updateCardSchema,
  payInvoiceSchema,
  currentInvoiceQuerySchema,
  invoiceForQuerySchema,
  setCardStatusSchema,
} from "./schemas";
import { CardDomainError } from "./errors";
import type { ActionResult, Card, CardInvoice, CardStatus, CardWithSummary, Invoice, PayInvoiceResult } from "./types";

const CARDS_PATH = "/cards";
const DASHBOARD_PATH = "/dashboard";
const TRANSACTIONS_PATH = "/transactions";

/** Server Actions só delegam para o module (docs/99-CLAUDE.md, "Regra de Ouro"). */

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

const UNAUTHENTICATED_ERROR = { code: "UNAUTHENTICATED", message: "Sessão inválida." } as const;

function toActionError(error: unknown): { success: false; error: { code: string; message: string } } {
  if (error instanceof CardDomainError) {
    return { success: false, error: { code: error.code, message: error.message } };
  }

  console.error("[modules/cards] unexpected error", error);
  return {
    success: false,
    error: { code: "UNKNOWN_ERROR", message: "Não foi possível concluir a operação." },
  };
}

function revalidateCardRoutes(): void {
  revalidatePath(CARDS_PATH);
  revalidatePath(DASHBOARD_PATH);
}

export async function createCardAction(input: unknown): Promise<ActionResult<Card>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const card = await cardService.createCard(userId, parsed.data);
    revalidateCardRoutes();
    return { success: true, data: card };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateCardAction(id: string, input: unknown): Promise<ActionResult<Card>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = updateCardSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const card = await cardService.updateCard(userId, id, parsed.data);
    revalidateCardRoutes();
    return { success: true, data: card };
  } catch (error) {
    return toActionError(error);
  }
}

/** Troca de status (ACTIVE/BLOCKED/CANCELLED) — `service.setStatus` sincroniza `isActive` (ver `prisma/schema.prisma` `Card.status`). */
export async function setCardStatusAction(cardId: string, status: CardStatus): Promise<ActionResult<Card>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = setCardStatusSchema.safeParse({ status });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const card = await cardService.setStatus(userId, cardId, parsed.data.status);
    revalidateCardRoutes();
    return { success: true, data: card };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteCardAction(id: string): Promise<ActionResult<null>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    await cardService.deleteCard(userId, id);
    revalidateCardRoutes();
    return { success: true, data: null };
  } catch (error) {
    return toActionError(error);
  }
}

export async function listCardsAction(): Promise<ActionResult<CardWithSummary[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const cards = await cardService.listWithSummary(userId);
    return { success: true, data: cards };
  } catch (error) {
    return toActionError(error);
  }
}

/** Fatura ABERTA do ciclo atual (`refDate` opcional — default agora, ver service.ts `currentInvoice`). */
export async function getInvoiceAction(input: unknown): Promise<ActionResult<Invoice>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = currentInvoiceQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const invoice = await cardService.currentInvoice(userId, parsed.data.cardId, parsed.data.refDate);
    return { success: true, data: invoice };
  } catch (error) {
    return toActionError(error);
  }
}

/** Fatura de um ciclo específico (histórico ou futuro), identificado pelo mês/ano de fechamento (ver service.ts `invoiceFor`). */
export async function getInvoiceForAction(input: unknown): Promise<ActionResult<Invoice>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = invoiceForQuerySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const invoice = await cardService.invoiceFor(
      userId,
      parsed.data.cardId,
      parsed.data.year,
      parsed.data.month,
    );
    return { success: true, data: invoice };
  } catch (error) {
    return toActionError(error);
  }
}

/** Histórico REAL de faturas fechadas armazenadas (docs/22-CREDIT_CARDS.md, ver `service.ts` `listStoredInvoices`). */
export async function listStoredInvoicesAction(cardId: string): Promise<ActionResult<CardInvoice[]>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  try {
    const invoices = await cardService.listStoredInvoices(userId, cardId);
    return { success: true, data: invoices };
  } catch (error) {
    return toActionError(error);
  }
}

export async function payInvoiceAction(input: unknown): Promise<ActionResult<PayInvoiceResult>> {
  const userId = await requireUserId();
  if (!userId) return { success: false, error: UNAUTHENTICATED_ERROR };

  const parsed = payInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Dados inválidos." },
    };
  }

  try {
    const result = await payInvoice(userId, parsed.data);
    revalidateCardRoutes();
    revalidatePath(TRANSACTIONS_PATH);
    return { success: true, data: result };
  } catch (error) {
    return toActionError(error);
  }
}
