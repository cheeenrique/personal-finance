import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCardInvoice } from "./card-invoice-parser";

const FATURA_PATH = join(__dirname, "../../../lib/pdf/__fixtures__/fatura-com-senha.pdf");
const NUBANK_PATH = join(__dirname, "../../../lib/pdf/__fixtures__/nubank-sem-senha.pdf");
const canRunLive = Boolean(process.env.NVIDIA_API_KEY) && existsSync(FATURA_PATH) && existsSync(NUBANK_PATH);

describe.skipIf(!canRunLive)("parseCardInvoice (chamada real à NIM — precisa de NVIDIA_API_KEY + fixtures)", () => {
  it("extrai lançamentos de uma fatura COM senha", async () => {
    const bytes = readFileSync(FATURA_PATH);
    const result = await parseCardInvoice(bytes, "028574373");
    expect(result.transactions.length).toBeGreaterThan(0);
    for (const transaction of result.transactions) {
      expect(["EXPENSE", "INCOME"]).toContain(transaction.type);
      expect(transaction.fitId).toBeNull();
    }
  }, 120_000);

  it("extrai lançamentos de um PDF SEM senha", async () => {
    const bytes = readFileSync(NUBANK_PATH);
    const result = await parseCardInvoice(bytes);
    expect(result.transactions.length).toBeGreaterThan(0);
  }, 120_000);

  it("senha errada vira erro isolado, não lança", async () => {
    const bytes = readFileSync(FATURA_PATH);
    const result = await parseCardInvoice(bytes, "senha-errada-000");
    expect(result.transactions).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.reason).toMatch(/senha/i);
  }, 30_000);
});

describe("parseCardInvoice (sem rede — smoke de erro-como-dado)", () => {
  it("PDF corrompido/inválido vira erro isolado, nunca lança", async () => {
    const result = await parseCardInvoice(Buffer.from("não é um pdf"));
    expect(result.transactions).toEqual([]);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
