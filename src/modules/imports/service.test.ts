import { describe, expect, it } from "vitest";
import { buildFallbackKey } from "./service";
import type { ImportTarget } from "./types";

const ACCOUNT: ImportTarget = { kind: "account", accountId: "acc_1" };
const CARD: ImportTarget = { kind: "card", cardId: "card_1" };
const DATE = new Date("2026-07-10T12:00:00-03:00");

describe("buildFallbackKey", () => {
  it("conta: chave inclui data + valor + descrição", () => {
    const key = buildFallbackKey(ACCOUNT, DATE, "150.00", "Supermercado ABC");
    expect(key).toBe("2026-07-10|150.00|supermercado abc");
  });

  it("cartão: chave é SÓ data + valor (sem descrição) — spec: dedup de fatura é (data,valor)", () => {
    const key = buildFallbackKey(CARD, DATE, "150.00", "Loja qualquer");
    expect(key).toBe("2026-07-10|150.00");
  });

  it("cartão: 2 compras mesma data/valor mas descrição diferente colidem na MESMA chave (dedup mais agressivo que conta, por design)", () => {
    const keyA = buildFallbackKey(CARD, DATE, "50.00", "Uber");
    const keyB = buildFallbackKey(CARD, DATE, "50.00", "iFood");
    expect(keyA).toBe(keyB);
  });

  it("conta: mesma data/valor mas descrição diferente NÃO colide", () => {
    const keyA = buildFallbackKey(ACCOUNT, DATE, "50.00", "Uber");
    const keyB = buildFallbackKey(ACCOUNT, DATE, "50.00", "iFood");
    expect(keyA).not.toBe(keyB);
  });
});
