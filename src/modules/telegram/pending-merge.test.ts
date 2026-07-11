import { describe, expect, it } from "vitest";
import { isCancelCommand, mergeReplyIntoDraft } from "./pending-merge";
import type { TelegramDraft } from "./types";

const baseDraft: TelegramDraft = {
  type: "EXPENSE",
  amount: null,
  description: "mercado",
  date: null,
  categoryName: null,
  paymentMethod: null,
  originKind: null,
  originName: null,
};

describe("isCancelCommand", () => {
  it("reconhece 'cancelar' minúsculo", () => {
    expect(isCancelCommand("cancelar")).toBe(true);
  });

  it("reconhece 'Cancelar' com maiúscula inicial", () => {
    expect(isCancelCommand("Cancelar")).toBe(true);
  });

  it("reconhece 'CANCELAR' em caixa alta", () => {
    expect(isCancelCommand("CANCELAR")).toBe(true);
  });

  it("não reconhece 'cancela' (verbo diferente)", () => {
    expect(isCancelCommand("cancela")).toBe(false);
  });

  it("não reconhece 'mercado'", () => {
    expect(isCancelCommand("mercado")).toBe(false);
  });
});

describe("mergeReplyIntoDraft — missingField=amount", () => {
  it("extrai número de resposta só com o número ('30')", () => {
    const result = mergeReplyIntoDraft(baseDraft, "amount", "30");
    expect(result.amount).toBe("30");
  });

  it("extrai número de resposta com texto ('foi 30')", () => {
    const result = mergeReplyIntoDraft(baseDraft, "amount", "foi 30");
    expect(result.amount).toBe("30");
  });

  it("extrai e converte vírgula decimal de 'R$ 30,50'", () => {
    const result = mergeReplyIntoDraft(baseDraft, "amount", "R$ 30,50");
    expect(result.amount).toBe("30.50");
  });

  it("resposta sem número devolve o draft inalterado", () => {
    const result = mergeReplyIntoDraft(baseDraft, "amount", "não sei");
    expect(result).toEqual(baseDraft);
  });

  it("não mexe em outros campos do draft ao extrair amount", () => {
    const result = mergeReplyIntoDraft(baseDraft, "amount", "30");
    expect(result).toEqual({ ...baseDraft, amount: "30" });
  });
});

describe("mergeReplyIntoDraft — missingField=origin", () => {
  it("reconhece canal 'credito' como paymentMethod credit", () => {
    const result = mergeReplyIntoDraft(baseDraft, "origin", "credito");
    expect(result.paymentMethod).toBe("credit");
  });

  it("reconhece canal 'pix' como paymentMethod pix", () => {
    const result = mergeReplyIntoDraft(baseDraft, "origin", "pix");
    expect(result.paymentMethod).toBe("pix");
  });

  it("reconhece canal 'ted' como paymentMethod transfer", () => {
    const result = mergeReplyIntoDraft(baseDraft, "origin", "ted");
    expect(result.paymentMethod).toBe("transfer");
  });

  it("reconhece canal 'dinheiro' como paymentMethod cash", () => {
    const result = mergeReplyIntoDraft(baseDraft, "origin", "dinheiro");
    expect(result.paymentMethod).toBe("cash");
  });

  it("preenche originName com o texto bruto da resposta", () => {
    const result = mergeReplyIntoDraft(baseDraft, "origin", "credito nubank");
    expect(result.originName).toBe("credito nubank");
    expect(result.paymentMethod).toBe("credit");
  });

  it("resposta vazia não seta originName e mantém paymentMethod atual do draft", () => {
    const draftWithMethod: TelegramDraft = { ...baseDraft, paymentMethod: "pix" };
    const result = mergeReplyIntoDraft(draftWithMethod, "origin", "   ");
    expect(result.originName).toBe(null);
    expect(result.paymentMethod).toBe("pix");
  });

  it("resposta sem canal reconhecido preserva o paymentMethod já existente no draft", () => {
    const draftWithMethod: TelegramDraft = { ...baseDraft, paymentMethod: "cash" };
    const result = mergeReplyIntoDraft(draftWithMethod, "origin", "Nubank");
    expect(result.paymentMethod).toBe("cash");
    expect(result.originName).toBe("Nubank");
  });
});
