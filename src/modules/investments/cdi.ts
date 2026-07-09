import { z } from "zod";
import { callGemini } from "@/lib/ai/gemini";
import { calendarPartsSP, startOfDaySP } from "@/lib/date/calendar-sp";
import { MarketIndexQuoteSource } from "@/generated/prisma/enums";
import { investmentRepository } from "./repository";
import type { CdiQuoteView } from "./types";

const cdiGeminiSchema = z.object({
  annualRatePercent: z.number().min(0).max(100),
});

const CDI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    annualRatePercent: { type: "NUMBER", description: "Taxa CDI anual em percentual (ex.: 13.65)" },
  },
  required: ["annualRatePercent"],
};

/** Meia-noite SP do dia calendário de `date` — chave do cache diário. */
export function cdiQuoteDay(date: Date = new Date()): Date {
  const parts = calendarPartsSP(date);
  return startOfDaySP(parts.year, parts.month, parts.day);
}

/**
 * CDI a.a. do dia: cache `MarketIndexQuote` → Gemini → null.
 * Fonte Gemini NÃO é oficial (BCB) — UI deve rotular como estimativa.
 */
export async function getCdiAnnualRate(date: Date = new Date()): Promise<CdiQuoteView | null> {
  const day = cdiQuoteDay(date);
  const cached = await investmentRepository.findCdiQuote(day);
  if (cached) {
    return {
      annualRatePercent: cached.annualRatePercent,
      date: cached.date,
      source: cached.source,
    };
  }

  const fetched = await callGemini<{ annualRatePercent: number }>(
    [
      {
        parts: [
          {
            text: [
              "Qual é a taxa CDI anual (percentual a.a.) vigente no Brasil hoje?",
              "Responda só JSON com annualRatePercent (número, ex.: 13.65).",
              "Use o valor mais recente conhecido do CDI over / taxa DI anualizada.",
            ].join(" "),
          },
        ],
      },
    ],
    "cdi-quote",
    CDI_RESPONSE_SCHEMA,
    (raw) => {
      const parsed = cdiGeminiSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  );

  if (!fetched) return null;

  const rate = fetched.annualRatePercent.toFixed(4);
  const quote = await investmentRepository.upsertCdiQuote({
    date: day,
    annualRatePercent: rate,
    source: MarketIndexQuoteSource.GEMINI,
  });

  return {
    annualRatePercent: quote.annualRatePercent,
    date: quote.date,
    source: quote.source,
  };
}

/** Entrada manual de CDI do dia (fallback quando Gemini falha). */
export async function upsertCdiManual(annualRatePercent: string, date: Date = new Date()): Promise<CdiQuoteView> {
  const day = cdiQuoteDay(date);
  const quote = await investmentRepository.upsertCdiQuote({
    date: day,
    annualRatePercent,
    source: MarketIndexQuoteSource.MANUAL,
  });

  return {
    annualRatePercent: quote.annualRatePercent,
    date: quote.date,
    source: quote.source,
  };
}
