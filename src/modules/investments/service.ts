import type { Asset } from "@/generated/prisma/client";
import { investmentRepository } from "./repository";
import { contributeToInvestment, createInvestmentWithOptionalContribution } from "./contribute";
import { getCdiAnnualRate, upsertCdiManual } from "./cdi";
import { projectYield } from "./project";
import { InvestmentNotFoundError } from "./errors";
import type {
  CreateInvestmentInput,
  ProjectYieldInput,
  UpdateInvestmentInput,
  UpsertCdiManualInput,
} from "./schemas";
import type { CdiQuoteView, InvestmentDetail, InvestmentListItem, YieldProjection } from "./types";

async function list(userId: string): Promise<InvestmentListItem[]> {
  return investmentRepository.listInvestments(userId);
}

async function getDetail(userId: string, id: string): Promise<InvestmentDetail> {
  const investment = await investmentRepository.findInvestment(userId, id);
  if (!investment) throw new InvestmentNotFoundError(id);

  const contributions = await investmentRepository.listContributions(userId, id);

  return {
    id: investment.id,
    name: investment.name,
    currentValue: investment.currentValue,
    purchaseValue: investment.purchaseValue,
    purchaseDate: investment.purchaseDate,
    yieldPercentOfBenchmark: investment.yieldPercentOfBenchmark,
    notes: investment.notes,
    contributions,
  };
}

/** Cria Asset INVESTMENT + aporte inicial opcional (atômico). */
async function createInvestment(userId: string, input: CreateInvestmentInput): Promise<Asset> {
  return createInvestmentWithOptionalContribution(userId, input);
}

async function updateInvestment(userId: string, id: string, input: UpdateInvestmentInput): Promise<Asset> {
  const existing = await investmentRepository.findInvestment(userId, id);
  if (!existing) throw new InvestmentNotFoundError(id);

  return investmentRepository.updateInvestmentAsset(id, {
    name: input.name,
    yieldPercentOfBenchmark: input.yieldPercentOfBenchmark,
    notes: input.notes,
  });
}

async function deleteInvestment(userId: string, id: string): Promise<void> {
  const deleted = await investmentRepository.softDeleteInvestment(userId, id);
  if (!deleted) throw new InvestmentNotFoundError(id);
}

async function getCdi(date?: Date): Promise<CdiQuoteView | null> {
  return getCdiAnnualRate(date);
}

async function setCdiManual(input: UpsertCdiManualInput): Promise<CdiQuoteView> {
  return upsertCdiManual(input.annualRatePercent, input.date);
}

function project(input: ProjectYieldInput): YieldProjection {
  return projectYield(input);
}

export const investmentService = {
  list,
  getDetail,
  createInvestment,
  updateInvestment,
  deleteInvestment,
  contribute: contributeToInvestment,
  getCdi,
  setCdiManual,
  project,
};
