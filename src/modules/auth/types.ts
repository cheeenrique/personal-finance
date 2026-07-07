export type ActionError = { code: string; message: string };

/** Envelope de retorno de toda Server Action deste módulo (mesmo padrão de `modules/settings/types.ts` e `modules/budgets/types.ts`). */
export type ActionResult<T> = { success: true; data: T } | { success: false; error: ActionError };

/** Retorno de `updateProfileAction` — só os campos que a UI precisa refletir na tela sem reload. */
export type UpdatedProfile = { name: string; email: string };
