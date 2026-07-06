/**
 * Remove acentos e normaliza para minúsculas. Usado tanto no reconhecimento
 * de comandos ("saldo", "gastos mês") quanto na inferência de categoria por
 * palavra-chave (`resolve.ts`) — mesma função, DRY (rule 02-dry-kiss-yagni).
 */
export function normalizeWord(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
