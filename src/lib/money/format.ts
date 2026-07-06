/**
 * Formata um valor monetário para BRL (R$ 1.234,56).
 *
 * Dinheiro nunca é float no domínio (Prisma `Decimal(12,2)` no banco).
 * Aqui aceitamos `string | number` porque isto é uma função de apresentação
 * (formatação de display), nunca de cálculo — a soma/subtração de valores
 * deve acontecer antes, com `Decimal`, nunca com o `number` resultante daqui.
 */
export function formatBRL(value: string | number): string {
  const amount = typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}
