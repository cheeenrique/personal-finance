import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractPdfText, PdfPasswordError } from "./extract-text";

const FIXTURES_DIR = join(__dirname, "__fixtures__");
const FATURA_PATH = join(FIXTURES_DIR, "fatura-com-senha.pdf");
const NUBANK_PATH = join(FIXTURES_DIR, "nubank-sem-senha.pdf");
const hasFixtures = existsSync(FATURA_PATH) && existsSync(NUBANK_PATH);

describe.skipIf(!hasFixtures)("extractPdfText (fixtures reais)", () => {
  it("extrai texto de um PDF sem senha (Nubank)", async () => {
    const bytes = readFileSync(NUBANK_PATH);
    const result = await extractPdfText(bytes);
    expect(result.hasTextLayer).toBe(true);
    expect(result.text.length).toBeGreaterThan(20);
  });

  it("extrai texto de um PDF com a senha correta", async () => {
    const bytes = readFileSync(FATURA_PATH);
    const result = await extractPdfText(bytes, "028574373");
    expect(result.hasTextLayer).toBe(true);
    expect(result.text.length).toBeGreaterThan(20);
  });

  it("lança PdfPasswordError com senha errada", async () => {
    const bytes = readFileSync(FATURA_PATH);
    await expect(extractPdfText(bytes, "senha-errada-000")).rejects.toBeInstanceOf(PdfPasswordError);
  });

  it("lança PdfPasswordError quando o PDF exige senha e nenhuma foi informada", async () => {
    const bytes = readFileSync(FATURA_PATH);
    await expect(extractPdfText(bytes)).rejects.toBeInstanceOf(PdfPasswordError);
  });
});

describe("extractPdfText (sem fixture)", () => {
  it("propaga erro não-relacionado-a-senha (PDF corrompido) em vez de mascarar como PdfPasswordError", async () => {
    const garbage = Buffer.from("isto não é um PDF válido");
    await expect(extractPdfText(garbage)).rejects.not.toBeInstanceOf(PdfPasswordError);
  });
});
