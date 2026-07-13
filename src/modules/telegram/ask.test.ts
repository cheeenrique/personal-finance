import { afterEach, describe, expect, it, vi } from "vitest";

const callGeminiMock = vi.fn();
const totalBalanceMock = vi.fn();
const cashflowMock = vi.fn();
const categoryTotalsMock = vi.fn();
const healthScoreMock = vi.fn();

vi.mock("@/lib/ai/gemini", () => ({ callGemini: callGeminiMock }));
vi.mock("@/modules/accounts/service", () => ({ accountService: { totalBalance: totalBalanceMock } }));
vi.mock("@/modules/reports/service", () => ({
  reportService: { cashflow: cashflowMock, categoryTotals: categoryTotalsMock },
}));
vi.mock("@/modules/insights/service", () => ({ insightsService: { healthScore: healthScoreMock } }));

const { answerQuestion } = await import("./ask");

function decimalLike(value: string) {
  return { toString: () => value };
}

/**
 * Mocks os dados que `buildAskContext` monta em `Promise.all` (mesma ORDEM
 * declarada em `ask.ts`: balance, cashflow-thisMonth, cashflow-lastMonth,
 * categoryTotals-thisMonth, categoryTotals-lastMonth, healthScore) —
 * `mockResolvedValueOnce` encadeado por ordem de CHAMADA (síncrona, mesma
 * ordem do array), não por data real, pra não depender do timezone da
 * máquina que roda o teste.
 */
function mockContext(overrides: { thisMonthExpense?: string; lastMonthExpense?: string; balance?: string } = {}) {
  totalBalanceMock.mockResolvedValueOnce(decimalLike(overrides.balance ?? "1000.00"));
  cashflowMock
    .mockResolvedValueOnce({ expense: decimalLike(overrides.thisMonthExpense ?? "500.00"), income: decimalLike("0.00") })
    .mockResolvedValueOnce({ expense: decimalLike(overrides.lastMonthExpense ?? "400.00"), income: decimalLike("0.00") });
  categoryTotalsMock.mockResolvedValue([{ categoryName: "Mercado", total: decimalLike("200.00") }]);
  healthScoreMock.mockResolvedValueOnce({ score: 70 });
}

describe("answerQuestion", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("chama callGemini com source ask, schema Gemini e timeout de 10s", async () => {
    mockContext();
    callGeminiMock.mockResolvedValueOnce({ answer: "Você gastou R$ 500 esse mês." });

    await answerQuestion("user-1", "quanto gastei?");

    expect(callGeminiMock).toHaveBeenCalledWith(
      [{ parts: [{ text: expect.any(String) }] }],
      "ask",
      expect.objectContaining({ type: "OBJECT", required: ["answer"] }),
      expect.any(Function),
      10_000,
    );
  });

  it("callGemini retorna answer — devolve o texto da IA", async () => {
    mockContext();
    callGeminiMock.mockResolvedValueOnce({ answer: "Você gastou R$ 500 esse mês." });

    const result = await answerQuestion("user-1", "quanto gastei?");

    expect(result).toBe("Você gastou R$ 500 esse mês.");
  });

  it("callGemini retorna null — cai no fallback determinístico com os números do mês", async () => {
    mockContext({ thisMonthExpense: "500.00", lastMonthExpense: "400.00", balance: "1000.00" });
    callGeminiMock.mockResolvedValueOnce(null);

    const result = await answerQuestion("user-1", "quanto gastei?");

    expect(result).toContain("500,00");
    expect(result).toContain("400,00");
    expect(result).toContain("1.000,00");
  });

  it("prompt gerado contém o bloco de capacidades do bot", async () => {
    mockContext();
    callGeminiMock.mockResolvedValueOnce({ answer: "ok" });

    await answerQuestion("user-1", "o que você faz?");

    const [contents] = callGeminiMock.mock.calls[0] as [Array<{ parts: Array<{ text: string }> }>];
    const prompt = contents[0].parts[0].text;
    expect(prompt).toContain("criar categoria nova");
    expect(prompt).toContain("O bot NÃO FAZ");
  });
});
