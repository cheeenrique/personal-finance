import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCardsMock, listWithBalancesMock } = vi.hoisted(() => ({
  listCardsMock: vi.fn(),
  listWithBalancesMock: vi.fn(),
}));

vi.mock("@/modules/cards/service", () => ({
  cardService: { listCards: listCardsMock },
}));

vi.mock("@/modules/accounts/service", () => ({
  accountService: { listWithBalances: listWithBalancesMock },
}));

// resolve.ts também importa categoryService/investmentService/transactionService
// (não usados por resolveOriginStrict/expectedOriginKind) — mockados vazios só
// pra não tocar o Prisma real durante o import do módulo.
vi.mock("@/modules/categories/service", () => ({ categoryService: {} }));
vi.mock("@/modules/investments/service", () => ({ investmentService: {} }));
vi.mock("@/modules/transactions/service", () => ({ transactionService: {} }));

const { expectedOriginKind, resolveOriginStrict } = await import("./resolve");

describe("expectedOriginKind", () => {
  it("credit resolve pra card", () => {
    expect(expectedOriginKind("credit")).toBe("card");
  });

  it("debit resolve pra account", () => {
    expect(expectedOriginKind("debit")).toBe("account");
  });

  it("pix resolve pra account", () => {
    expect(expectedOriginKind("pix")).toBe("account");
  });

  it("transfer resolve pra account", () => {
    expect(expectedOriginKind("transfer")).toBe("account");
  });

  it("cash resolve pra account", () => {
    expect(expectedOriginKind("cash")).toBe("account");
  });

  it("null não restringe (null)", () => {
    expect(expectedOriginKind(null)).toBe(null);
  });
});

describe("resolveOriginStrict", () => {
  const userId = "user-1";

  beforeEach(() => {
    listCardsMock.mockReset();
    listWithBalancesMock.mockReset();
    listCardsMock.mockResolvedValue([]);
    listWithBalancesMock.mockResolvedValue([]);
  });

  it("originName null retorna status none sem consultar contas/cartões", async () => {
    const result = await resolveOriginStrict(userId, null, null, null);
    expect(result).toEqual({ status: "none" });
    expect(listCardsMock).not.toHaveBeenCalled();
    expect(listWithBalancesMock).not.toHaveBeenCalled();
  });

  it("originName só com ruído (ex.: 'crédito') vira núcleo vazio -> status none", async () => {
    const result = await resolveOriginStrict(userId, null, null, "crédito");
    expect(result).toEqual({ status: "none" });
  });

  it("resolved: 1 conta ativa bate por match exato", async () => {
    listWithBalancesMock.mockResolvedValue([
      { id: "acc-1", name: "Nubank", isActive: true },
      { id: "acc-2", name: "Itaú", isActive: true },
    ]);

    const result = await resolveOriginStrict(userId, "pix", null, "Nubank");
    expect(result).toEqual({
      status: "resolved",
      origin: { kind: "account", id: "acc-1", label: "Conta Nubank" },
    });
  });

  it("resolved: paymentMethod credit restringe a busca a cartões", async () => {
    listCardsMock.mockResolvedValue([{ id: "card-1", name: "Nubank", isActive: true }]);
    listWithBalancesMock.mockResolvedValue([{ id: "acc-1", name: "Nubank", isActive: true }]);

    const result = await resolveOriginStrict(userId, "credit", null, "Nubank");
    expect(result).toEqual({
      status: "resolved",
      origin: { kind: "card", id: "card-1", label: "Cartão Nubank" },
    });
    expect(listWithBalancesMock).not.toHaveBeenCalled();
  });

  it("resolved: match por 'contém' quando não há match exato ('Crédito Nubank' -> núcleo 'nubank')", async () => {
    listWithBalancesMock.mockResolvedValue([{ id: "acc-1", name: "Nubank - Pessoal", isActive: true }]);

    const result = await resolveOriginStrict(userId, "pix", null, "Crédito Nubank");
    expect(result).toEqual({
      status: "resolved",
      origin: { kind: "account", id: "acc-1", label: "Conta Nubank - Pessoal" },
    });
  });

  it("ambiguous: 2+ candidatos batem por 'contém' (Nubank Pessoal e Nubank MEI)", async () => {
    listWithBalancesMock.mockResolvedValue([
      { id: "acc-1", name: "Nubank - Pessoal", isActive: true },
      { id: "acc-2", name: "Nubank - MEI", isActive: true },
    ]);

    const result = await resolveOriginStrict(userId, "pix", null, "Nubank");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates.map((candidate) => candidate.id).sort()).toEqual(["acc-1", "acc-2"]);
    }
  });

  it("none: nenhuma conta/cartão ativo bate com o texto citado", async () => {
    listWithBalancesMock.mockResolvedValue([{ id: "acc-1", name: "Itaú", isActive: true }]);

    const result = await resolveOriginStrict(userId, "pix", null, "Nubank");
    expect(result).toEqual({ status: "none" });
  });

  it("none: conta existe mas está inativa (isActive=false) — não entra no match", async () => {
    listWithBalancesMock.mockResolvedValue([{ id: "acc-1", name: "Nubank", isActive: false }]);

    const result = await resolveOriginStrict(userId, "pix", null, "Nubank");
    expect(result).toEqual({ status: "none" });
  });
});
