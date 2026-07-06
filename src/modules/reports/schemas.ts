import { z } from "zod";
import { TransactionType } from "@/generated/prisma/enums";
import { dateInputSchema } from "@/lib/date/schema";

const ALL_TRANSACTION_TYPE_VALUES = Object.values(TransactionType) as [
  TransactionType,
  ...TransactionType[],
];

export const yearFilterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const monthFilterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const dateRangeSchema = z
  .object({
    dateFrom: dateInputSchema,
    dateTo: dateInputSchema,
  })
  .refine((data) => data.dateFrom.getTime() <= data.dateTo.getTime(), {
    message: "Data inicial não pode ser posterior à data final",
    path: ["dateFrom"],
  });

/** Filtros do export CSV — sem paginação/sort (export é sempre completo, ver docs/28-REPORTS.md "Exportação"). */
export const csvFilterSchema = z
  .object({
    dateFrom: dateInputSchema.optional(),
    dateTo: dateInputSchema.optional(),
    type: z.enum(ALL_TRANSACTION_TYPE_VALUES).optional(),
    categoryId: z.string().trim().min(1).optional(),
    accountId: z.string().trim().min(1).optional(),
    cardId: z.string().trim().min(1).optional(),
    tagId: z.string().trim().min(1).optional(),
    isPaid: z.boolean().optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom.getTime() <= data.dateTo.getTime(), {
    message: "Data inicial não pode ser posterior à data final",
    path: ["dateFrom"],
  });

export type YearFilterInput = z.infer<typeof yearFilterSchema>;
export type MonthFilterInput = z.infer<typeof monthFilterSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type CsvFilterInput = z.infer<typeof csvFilterSchema>;
