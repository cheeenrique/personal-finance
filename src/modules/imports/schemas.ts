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
