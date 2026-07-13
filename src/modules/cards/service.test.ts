import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { CardType } from "@/generated/prisma/enums";
import type { CardCycle, CycleRule } from "./cycle";

const { findByIdMock, findExpensesInRangeMock, findCardPaymentsInRangeMock } = vi.hoisted(() => ({
  findByIdMock: vi.fn(),
  findExpensesInRangeMock: vi.fn(),
  findCardPaymentsInRangeMock: vi.fn(),
}));

// `service.ts` importa `cardRepository` (que faz I/O real via Prisma) — mockado
// por inteiro pra testar só a lógica de `lastClosedInvoiceStatus`, sem tocar
// banco (mesmo padrão de `telegram/resolve.test.ts`).
vi.mock("./repository", () => ({
  cardRepository: {
    findById: findByIdMock,
    findExpensesInRange: findExpensesInRangeMock,
    findCardPaymentsInRange: findCardPaymentsInRangeMock,
  },
}));

const { cardService, evaluateInvoiceStatus, computeLastInvoiceFields } = await import("./service");

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const DUE_DATE = new Date("2026-07-20T03:00:00.000Z"); // 20/jul, meia-noite SP

describe("evaluateInvoiceStatus", () => {
  it("paidAmount >= total: paga, mesmo com today depois do vencimento", () => {
    const result = evaluateInvoiceStatus({
      total: decimal(500),
      paidAmount: decimal(500),
      dueDate: DUE_DATE,
      today: new Date("2026-08-01T03:00:00.000Z"),
    });
    expect(result).toEqual({ isPaid: true, isOverdue: false });
  });

  it("não paga, today == dia do vencimento: NÃO é atraso ainda (comparação estrita)", () => {
    const result = evaluateInvoiceStatus({
      total: decimal(500),
      paidAmount: decimal(0),
      dueDate: DUE_DATE,
      today: DUE_DATE,
    });
    expect(result).toEqual({ isPaid: false, isOverdue: false });
  });

  it("não paga, today 1 dia depois do vencimento: atrasada", () => {
    const oneDayAfter = new Date(DUE_DATE.getTime() + 24 * 60 * 60 * 1000);
    const result = evaluateInvoiceStatus({
      total: decimal(500),
      paidAmount: decimal(0),
      dueDate: DUE_DATE,
      today: oneDayAfter,
    });
    expect(result).toEqual({ isPaid: false, isOverdue: true });
  });

  it("não paga, today antes do vencimento: não é atraso", () => {
    const before = new Date(DUE_DATE.getTime() - 24 * 60 * 60 * 1000);
    const result = evaluateInvoiceStatus({
      total: decimal(500),
      paidAmount: decimal(0),
      dueDate: DUE_DATE,
      today: before,
    });
    expect(result).toEqual({ isPaid: false, isOverdue: false });
  });

  it("total=0 (sem compra no ciclo): trivialmente paga", () => {
    const result = evaluateInvoiceStatus({
      total: decimal(0),
      paidAmount: decimal(0),
      dueDate: DUE_DATE,
      today: new Date(DUE_DATE.getTime() + 24 * 60 * 60 * 1000),
    });
    expect(result.isPaid).toBe(true);
    expect(result.isOverdue).toBe(false);
  });

  it("pagamento PARCIAL (0 < paidAmount < total): conta como não paga (binário, decisão do dono)", () => {
    const result = evaluateInvoiceStatus({
      total: decimal(500),
      paidAmount: decimal(200),
      dueDate: DUE_DATE,
      today: new Date(DUE_DATE.getTime() - 24 * 60 * 60 * 1000),
    });
    expect(result.isPaid).toBe(false);
  });
});

describe("computeLastInvoiceFields", () => {
  const openCycle: CardCycle = {
    periodStart: new Date("2026-07-10T03:00:00.000Z"),
    periodEnd: new Date("2026-08-10T03:00:00.000Z"),
    dueDate: new Date("2026-08-20T03:00:00.000Z"),
  };
  const CLOSED_PERIOD_END = new Date("2026-07-10T03:00:00.000Z"); // == openCycle.periodStart
  // Vencimento da fatura FECHADA (mês de fechamento = julho) — diferente do
  // vencimento do ciclo ABERTO (`openCycle.dueDate`, mês de fechamento agosto).
  const CLOSED_DUE_DATE = new Date("2026-07-20T03:00:00.000Z");
  const CARD_CREATED_LONG_AGO = new Date("2020-01-01T00:00:00.000Z");
  const rules: CycleRule[] = [];
  const fallback = { closingDay: 10, dueDay: 20 };
  const TODAY_BEFORE_DUE = new Date("2026-07-15T03:00:00.000Z");

  it("cartão sem fatura anterior (criado dentro do ciclo aberto): 3 campos null", () => {
    const cardCreatedThisCycle = { createdAt: new Date("2026-07-12T03:00:00.000Z") };
    const result = computeLastInvoiceFields(
      cardCreatedThisCycle,
      rules,
      fallback,
      openCycle,
      [],
      [],
      TODAY_BEFORE_DUE,
    );
    expect(result).toEqual({ dueDate: null, isPaid: null, isOverdue: null });
  });

  it("fatura fechada com total=0 (sem compra no ciclo): esconde a faixa (3 campos null)", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, [], [], TODAY_BEFORE_DUE);
    expect(result).toEqual({ dueDate: null, isPaid: null, isOverdue: null });
  });

  it("pagamento EXATAMENTE no fechamento da fatura (início da janela, inclusive) conta", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const expenses = [{ amount: decimal(300), date: new Date("2026-06-15T00:00:00.000Z") }];
    const payments = [{ amount: decimal(300), date: CLOSED_PERIOD_END }];

    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, expenses, payments, TODAY_BEFORE_DUE);

    expect(result.isPaid).toBe(true);
  });

  it("pagamento EXATAMENTE no fechamento do PRÓXIMO ciclo (fim da janela, exclusive) NÃO conta", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const expenses = [{ amount: decimal(300), date: new Date("2026-06-15T00:00:00.000Z") }];
    // Pagamento datado no exato instante em que a janela fecha (openCycle.periodEnd) — fora da janela [gte, lt).
    const payments = [{ amount: decimal(300), date: openCycle.periodEnd }];

    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, expenses, payments, TODAY_BEFORE_DUE);

    expect(result.isPaid).toBe(false);
  });

  it("pagamento ANTES do fechamento da fatura (fora da janela) NÃO conta", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const expenses = [{ amount: decimal(300), date: new Date("2026-06-15T00:00:00.000Z") }];
    const payments = [{ amount: decimal(300), date: new Date("2026-06-20T00:00:00.000Z") }];

    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, expenses, payments, TODAY_BEFORE_DUE);

    expect(result.isPaid).toBe(false);
  });

  it("múltiplos pagamentos dentro da janela somam (ex.: parcelas de pagamento)", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const expenses = [{ amount: decimal(500), date: new Date("2026-06-15T00:00:00.000Z") }];
    const payments = [
      { amount: decimal(200), date: new Date("2026-07-12T00:00:00.000Z") },
      { amount: decimal(300), date: new Date("2026-07-18T00:00:00.000Z") },
    ];

    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, expenses, payments, TODAY_BEFORE_DUE);

    expect(result.isPaid).toBe(true);
    expect(result.dueDate?.getTime()).toBe(CLOSED_DUE_DATE.getTime());
  });

  it("não paga e today depois do vencimento: atrasada", () => {
    const card = { createdAt: CARD_CREATED_LONG_AGO };
    const expenses = [{ amount: decimal(500), date: new Date("2026-06-15T00:00:00.000Z") }];
    const todayAfterDue = new Date(CLOSED_DUE_DATE.getTime() + 24 * 60 * 60 * 1000);

    const result = computeLastInvoiceFields(card, rules, fallback, openCycle, expenses, [], todayAfterDue);

    expect(result).toEqual({ dueDate: CLOSED_DUE_DATE, isPaid: false, isOverdue: true });
  });
});

describe("cardService.lastClosedInvoiceStatus", () => {
  beforeEach(() => {
    findByIdMock.mockReset();
    findExpensesInRangeMock.mockReset();
    findCardPaymentsInRangeMock.mockReset();
  });

  const BASE_CARD = {
    id: "card_1",
    userId: "user_1",
    name: "Nubank",
    brand: "Mastercard",
    type: CardType.CREDIT,
    limit: decimal(5000),
    closingDay: 10,
    dueDay: 20,
    color: null,
    icon: null,
    lastFour: null,
    holderName: null,
    expiry: null,
    isActive: true,
    deletedAt: null,
    cycles: [],
  };

  it("cartão recém-criado, sem nenhum ciclo fechado ainda: retorna null e não consulta pagamentos", async () => {
    findByIdMock.mockResolvedValue({
      ...BASE_CARD,
      createdAt: new Date("2026-07-12T03:00:00.000Z"), // dentro do ciclo ABERTO [10/jul, 10/ago)
    });

    const refDate = new Date("2026-07-15T15:00:00.000Z");
    const result = await cardService.lastClosedInvoiceStatus("user_1", "card_1", refDate);

    expect(result).toBeNull();
    expect(findExpensesInRangeMock).not.toHaveBeenCalled();
    expect(findCardPaymentsInRangeMock).not.toHaveBeenCalled();
  });

  it("fatura fechada paga em dia: isPaid=true, isOverdue=false", async () => {
    findByIdMock.mockResolvedValue({
      ...BASE_CARD,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    findExpensesInRangeMock.mockResolvedValue([
      {
        id: "tx_1",
        description: "Compra",
        amount: decimal(400),
        date: new Date("2026-06-15T00:00:00.000Z"),
        installmentNumber: null,
        installmentPurchaseId: null,
      },
    ]);
    findCardPaymentsInRangeMock.mockResolvedValue([{ amount: decimal(400), date: new Date("2026-07-12T00:00:00.000Z") }]);

    const refDate = new Date("2026-07-15T15:00:00.000Z");
    const result = await cardService.lastClosedInvoiceStatus("user_1", "card_1", refDate);

    expect(result).not.toBeNull();
    expect(result?.isPaid).toBe(true);
    expect(result?.isOverdue).toBe(false);
    expect(result?.paidAmount.toString()).toBe("400");
  });

  it("fatura fechada não paga e vencida: isPaid=false, isOverdue=true", async () => {
    findByIdMock.mockResolvedValue({
      ...BASE_CARD,
      createdAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    findExpensesInRangeMock.mockResolvedValue([
      {
        id: "tx_1",
        description: "Compra",
        amount: decimal(400),
        date: new Date("2021-07-15T00:00:00.000Z"),
        installmentNumber: null,
        installmentPurchaseId: null,
      },
    ]);
    findCardPaymentsInRangeMock.mockResolvedValue([]);

    // `refDate` bem no passado (2021) — o ciclo fechado calculado vence em
    // 20/ago/2021, garantidamente já passado na data REAL em que o teste
    // roda (`startOfTodaySP()` usa `new Date()` de verdade, não `refDate`) —
    // resultado determinístico, sem depender do relógio da máquina de teste.
    const refDate = new Date("2021-08-15T15:00:00.000Z");
    const result = await cardService.lastClosedInvoiceStatus("user_1", "card_1", refDate);

    expect(result).not.toBeNull();
    expect(result?.isPaid).toBe(false);
    expect(result?.isOverdue).toBe(true);
  });
});
