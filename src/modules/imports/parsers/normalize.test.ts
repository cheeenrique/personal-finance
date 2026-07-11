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
});

describe("safeSnippet", () => {
  it("serializa em JSON", () => {
    expect(safeSnippet({ a: 1 })).toBe('{"a":1}');
  });
});
