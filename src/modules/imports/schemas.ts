import { z } from "zod";

const MAX_FILE_CONTENT_LENGTH = 5_000_000;
const MAX_TRANSACTIONS = 20_000;

/** Espelha `ImportTarget` (`types.ts`) em zod — discriminated union garante que só um dos
 * dois ids (accountId|cardId) chega na action, nunca os dois nem nenhum. */
export const importTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("account"), accountId: z.string().trim().min(1, "Conta é obrigatória") }),
  z.object({ kind: z.literal("card"), cardId: z.string().trim().min(1, "Cartão é obrigatório") }),
]);

export const importSchema = z.object({
  target: importTargetSchema,
  fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório"),
  fileContent: z.string().min(1, "Arquivo vazio").max(MAX_FILE_CONTENT_LENGTH, "Arquivo muito grande"),
  /** Senha do PDF (fatura cifrada) — opcional, só relevante pra target cartão + arquivo PDF (`card-invoice-parser.ts`). */
  password: z.string().trim().min(1).optional(),
});

export type ImportInput = z.infer<typeof importSchema>;

const parsedTransactionSchema = z.object({
  fitId: z.string().nullable(),
  date: z.coerce.date(),
  amount: z.string().trim().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string(),
});

const parseErrorSchema = z.object({ snippet: z.string(), reason: z.string() });

export const commitImportSchema = z.object({
  target: importTargetSchema,
  transactions: z.array(parsedTransactionSchema).max(MAX_TRANSACTIONS, "Extrato muito grande"),
  errors: z.array(parseErrorSchema),
});

export type CommitImportInput = z.infer<typeof commitImportSchema>;
