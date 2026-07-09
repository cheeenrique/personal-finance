import type { MerchantCategoryRule } from "@/generated/prisma/client";

export type { MerchantCategoryRule };

export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo. */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };
