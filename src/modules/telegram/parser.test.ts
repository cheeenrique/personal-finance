import { describe, expect, it } from "vitest";
import { telegramParser } from "./parser";

describe("telegramParser.parseMessage", () => {
  describe("comandos determinísticos", () => {
    it("reconhece 'saldo' como query_balance", () => {
      expect(telegramParser.parseMessage("saldo")).toEqual({ kind: "query_balance" });
    });

    it("reconhece 'hoje' como query_today", () => {
      expect(telegramParser.parseMessage("hoje")).toEqual({ kind: "query_today" });
    });

    it("reconhece 'gastos mes' como query_month_expenses", () => {
      expect(telegramParser.parseMessage("gastos mes")).toEqual({ kind: "query_month_expenses" });
    });

    it("reconhece comando com acento ('gastos mês')", () => {
      expect(telegramParser.parseMessage("gastos mês")).toEqual({ kind: "query_month_expenses" });
    });
  });

  describe("lançamento simples", () => {
    it("interpreta 'mercado 120' como create_transaction EXPENSE", () => {
      expect(telegramParser.parseMessage("mercado 120")).toEqual({
        kind: "create_transaction",
        type: "EXPENSE",
        amount: "120",
        description: "mercado",
        keywordCandidates: ["mercado"],
      });
    });

    it("mantém a palavra extra antes da descrição em keywordCandidates", () => {
      expect(telegramParser.parseMessage("almoco 45 restaurante")).toEqual({
        kind: "create_transaction",
        type: "EXPENSE",
        amount: "45",
        description: "almoco",
        keywordCandidates: ["restaurante", "almoco"],
      });
    });
  });

  describe("income keywords", () => {
    it("interpreta 'salario 5000' como INCOME", () => {
      const result = telegramParser.parseMessage("salario 5000");
      expect(result.kind).toBe("create_transaction");
      expect(result).toMatchObject({ type: "INCOME", amount: "5000", description: "salario" });
    });

    it("interpreta 'freela 800' como INCOME", () => {
      const result = telegramParser.parseMessage("freela 800");
      expect(result).toMatchObject({ type: "INCOME", amount: "800", description: "freela" });
    });

    it("interpreta 'freelance 800' como INCOME", () => {
      const result = telegramParser.parseMessage("freelance 800");
      expect(result).toMatchObject({ type: "INCOME", amount: "800" });
    });

    it("descrição com acento/caixa diferente ainda reconhece INCOME ('Salário 5000')", () => {
      const result = telegramParser.parseMessage("Salário 5000");
      expect(result).toMatchObject({ type: "INCOME" });
    });
  });

  describe("vírgula decimal", () => {
    it("converte 'uber 30,50' para amount '30.50'", () => {
      const result = telegramParser.parseMessage("uber 30,50");
      expect(result).toMatchObject({ type: "EXPENSE", amount: "30.50", description: "uber" });
    });
  });

  describe("unknown", () => {
    it("string vazia retorna unknown", () => {
      expect(telegramParser.parseMessage("")).toEqual({ kind: "unknown" });
    });

    it("string só com espaços retorna unknown", () => {
      expect(telegramParser.parseMessage("   ")).toEqual({ kind: "unknown" });
    });

    it("1 token só, que não é comando, retorna unknown", () => {
      expect(telegramParser.parseMessage("mercado")).toEqual({ kind: "unknown" });
    });

    it("sem número reconhecível retorna unknown", () => {
      expect(telegramParser.parseMessage("mercado hoje")).toEqual({ kind: "unknown" });
    });
  });

  describe("edge cases do AMOUNT_PATTERN / posição", () => {
    it("número na 1ª posição não conta como amount (index>0 obrigatório)", () => {
      // "120 mercado" -> tokens[0]="120" é tratado como description; sem outro
      // número nos tokens restantes -> unknown.
      expect(telegramParser.parseMessage("120 mercado")).toEqual({ kind: "unknown" });
    });

    it("rejeita número com mais de 2 casas decimais", () => {
      expect(telegramParser.parseMessage("mercado 30,505")).toEqual({ kind: "unknown" });
    });

    it("rejeita número com letras coladas", () => {
      expect(telegramParser.parseMessage("mercado 30kg")).toEqual({ kind: "unknown" });
    });

    it("aceita inteiro sem casas decimais", () => {
      const result = telegramParser.parseMessage("mercado 100");
      expect(result).toMatchObject({ amount: "100" });
    });

    it("usa o primeiro número válido encontrado após a descrição", () => {
      const result = telegramParser.parseMessage("mercado 120 30");
      expect(result).toMatchObject({ amount: "120", keywordCandidates: ["30", "mercado"] });
    });
  });
});
