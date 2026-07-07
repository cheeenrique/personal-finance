import { z } from "zod";

/** ~5MB de texto — generoso pra qualquer extrato OFX real, só uma trava contra payload absurdo (validação na borda). */
const MAX_FILE_CONTENT_LENGTH = 5_000_000;

export const ofxImportSchema = z.object({
  accountId: z.string().trim().min(1, "Conta é obrigatória"),
  fileContent: z
    .string()
    .min(1, "Arquivo vazio")
    .max(MAX_FILE_CONTENT_LENGTH, "Arquivo muito grande"),
});

export type OfxImportInput = z.infer<typeof ofxImportSchema>;
