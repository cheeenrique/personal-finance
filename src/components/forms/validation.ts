/**
 * Checagem de presença (vazio ou só espaços) usada na validação client-side
 * "campo obrigatório vazio" de todo formulário — não recria as regras de
 * negócio dos schemas Zod (`modules/*­/schemas.ts`), só decide se o campo foi
 * preenchido. Formato/range/relacionamento continuam validados no backend.
 */
export function isBlank(value: string): boolean {
  return value.trim().length === 0;
}
