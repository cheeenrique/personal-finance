import { describe, expect, it } from "vitest";
import { normalizeAmount, normalizeTransactionItem, parseIsoDateSP, parseTransactionEnvelope, safeSnippet } from "./normalize";

describe("parseTransactionEnvelope", () => {
  it("aceita { transactions: [...] }", () => {
    expect(parseTransactionEnvelope({ transactions: [{ a: 1 }] })).toEqual([{ a: 1 }]);
  });

  it("rejeita shape sem transactions", () => {
    expect(parseTransactionEnvelope({ foo: "bar" })).toBeNull();
  });
});

describe("normalizeAmount", () => {
  it("normaliza pra 2 casas decimais", () => {
    expect(normalizeAmount("150.5")).toBe("150.50");
    expect(normalizeAmount("50")).toBe("50.00");
  });
});

describe("parseIsoDateSP", () => {
  it("aceita YYYY-MM-DD válido", () => {
    expect(parseIsoDateSP("2026-07-10")).not.toBeNull();
  });

  it("rejeita mês/dia fora de faixa", () => {
    expect(parseIsoDateSP("2026-13-01")).toBeNull();
    expect(parseIsoDateSP("2026-01-40")).toBeNull();
  });
});

describe("normalizeTransactionItem", () => {
  it("normaliza item válido pra ParsedTransaction com fitId null", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "99.9", type: "EXPENSE", description: "  Mercado  " });
    expect(result).toEqual({
      transaction: { fitId: null, date: expect.any(Date), amount: "99.90", type: "EXPENSE", description: "Mercado" },
    });
  });

  it("vira erro isolado quando o shape do item não bate", () => {
    const result = normalizeTransactionItem({ date: "não é data", amount: "x", type: "EXPENSE" });
    expect("error" in result).toBe(true);
  });

  it("vira erro isolado quando a data é inválida mesmo com shape ok", () => {
    const result = normalizeTransactionItem({ date: "2026-13-40", amount: "10.00", type: "EXPENSE", description: "x" });
    expect("error" in result).toBe(true);
  });

  it("passa suggestedCategoryName da IA pro campo do ParsedTransaction (fatura)", () => {
    const result = normalizeTransactionItem({
      date: "2026-07-10",
      amount: "50.00",
      type: "EXPENSE",
      description: "AZUL SEGUROS",
      categoryName: "Seguros",
    });
    expect("transaction" in result && result.transaction.suggestedCategoryName).toBe("Seguros");
  });

  it("suggestedCategoryName null quando a IA não soube sugerir", () => {
    const result = normalizeTransactionItem({
      date: "2026-07-10",
      amount: "50.00",
      type: "EXPENSE",
      description: "x",
      categoryName: null,
    });
    expect("transaction" in result && result.transaction.suggestedCategoryName).toBeNull();
  });

  it("suggestedCategoryName undefined quando o item não manda o campo (extrato, pdf-parser)", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "50.00", type: "EXPENSE", description: "x" });
    expect("transaction" in result && result.transaction.suggestedCategoryName).toBeUndefined();
  });

  it("normaliza valor BR '1.486,64' (milhar + vírgula) pra decimal canônico", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "1.486,64", type: "EXPENSE", description: "x" });
    expect("transaction" in result && result.transaction.amount).toBe("1486.64");
  });

  it("normaliza valor BR '1486,64' (só vírgula, sem milhar) pra decimal canônico", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "1486,64", type: "EXPENSE", description: "x" });
    expect("transaction" in result && result.transaction.amount).toBe("1486.64");
  });

  it("mantém valor já canônico '1486.64' (ponto) intocado", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "1486.64", type: "EXPENSE", description: "x" });
    expect("transaction" in result && result.transaction.amount).toBe("1486.64");
  });

  it("normaliza valor BR '196,83' pra decimal canônico", () => {
    const result = normalizeTransactionItem({ date: "2026-07-10", amount: "196,83", type: "EXPENSE", description: "x" });
    expect("transaction" in result && result.transaction.amount).toBe("196.83");
  });
});

describe("safeSnippet", () => {
  it("serializa em JSON", () => {
    expect(safeSnippet({ a: 1 })).toBe('{"a":1}');
  });
});
