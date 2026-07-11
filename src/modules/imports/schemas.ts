import { z } from "zod";

/** ~5MB de texto — generoso pra qualquer extrato real (OFX/CSV), só uma trava contra payload absurdo (validação na borda). */
const MAX_FILE_CONTENT_LENGTH = 5_000_000;

export const importSchema = z.object({
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  /** Nome original do arquivo — usado só pra detectar o formato pela extensão (`parsers/index.ts`), nunca persistido. */
  fileName: z.string().trim().min(1, "Nome do arquivo é obrigatório"),
  fileContent: z
    .string()
    .min(1, "Arquivo vazio")
    .max(MAX_FILE_CONTENT_LENGTH, "Arquivo muito grande"),
});

export type ImportInput = z.infer<typeof importSchema>;

/** Trava contra payload absurdo no commit — nenhum extrato real chega perto. */
const MAX_TRANSACTIONS = 20_000;

const parsedTransactionSchema = z.object({
  fitId: z.string().nullable(),
  date: z.coerce.date(),
  amount: z.string().trim().min(1),
  type: z.enum(["INCOME", "EXPENSE"]),
  description: z.string(),
});

const parseErrorSchema = z.object({
  snippet: z.string(),
  reason: z.string(),
});

/**
 * Payload do commit — as transações já parseadas pela prévia
 * (`previewImport`), revalidadas na borda antes de gravar (o commit não
 * reparseia o arquivo, ver `service.ts` `commitImport`).
 */
export const commitImportSchema = z.object({
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  transactions: z.array(parsedTransactionSchema).max(MAX_TRANSACTIONS, "Extrato muito grande"),
  errors: z.array(parseErrorSchema),
});

export type CommitImportInput = z.infer<typeof commitImportSchema>;
