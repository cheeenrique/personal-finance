import { positiveDecimalSchema } from "@/lib/money/schema";
import { investmentService } from "@/modules/investments/service";
import {
  InsufficientAccountBalanceError,
  InvestmentDomainError,
} from "@/modules/investments/errors";
import {
  findAporteCategoryId,
  matchActiveAccountByName,
  matchInvestmentByName,
  resolveDefaultActiveAccount,
} from "./resolve";
import {
  buildErrorReply,
  buildInvestmentContributionReply,
  buildInvestmentNotFoundReply,
  buildInvestmentNeedAmountReply,
  buildInvestmentNeedNameReply,
  buildInsufficientBalanceReply,
} from "./reply";
import type { CommandResult, TelegramInvestParsed } from "./types";

/**
 * Aporte via Telegram (`intent="invest"`, docs/28-INVESTMENTS.md +
 * docs/30-TELEGRAM.md): resolve produto + conta, valida saldo no domínio
 * (`contributeToInvestment`) e confirma.
 */
export async function handleInvestContribution(
  userId: string,
  invest: TelegramInvestParsed,
): Promise<CommandResult> {
  if (!invest.amount || !positiveDecimalSchema.safeParse(invest.amount).success) {
    return { text: buildInvestmentNeedAmountReply(), resultCode: "invest_need_amount" };
  }

  if (!invest.investmentName) {
    return { text: buildInvestmentNeedNameReply(), resultCode: "invest_need_name" };
  }

  const investment = await matchInvestmentByName(userId, invest.investmentName);
  if (!investment) {
    return {
      text: buildInvestmentNotFoundReply(invest.investmentName),
      resultCode: "invest_not_found",
    };
  }

  let account: { id: string; name: string };
  if (invest.accountName) {
    const matched = await matchActiveAccountByName(userId, invest.accountName);
    if (!matched) {
      return {
        text: buildErrorReply(`Não encontrei a conta "${invest.accountName}".`),
        resultCode: "invest_account_not_found",
      };
    }
    account = matched;
  } else {
    account = await resolveDefaultActiveAccount(userId);
  }

  const categoryId = await findAporteCategoryId(userId);
  if (!categoryId) {
    return {
      text: buildErrorReply('Categoria "Investimento (aporte)" não encontrada. Recrie-a em Categorias.'),
      resultCode: "invest_category_missing",
    };
  }

  try {
    await investmentService.contribute(userId, investment.id, {
      accountId: account.id,
      amount: invest.amount,
      categoryId,
      date: new Date(),
    });

    const detail = await investmentService.getDetail(userId, investment.id);

    return {
      text: buildInvestmentContributionReply({
        investmentName: investment.name,
        amount: invest.amount,
        accountName: account.name,
        position: detail.currentValue.toString(),
      }),
      resultCode: "invest_contributed",
    };
  } catch (error) {
    if (error instanceof InsufficientAccountBalanceError) {
      const balance =
        typeof error.context?.balance === "string" ? error.context.balance : "0";
      return {
        text: buildInsufficientBalanceReply(account.name, balance, invest.amount),
        resultCode: "invest_insufficient_balance",
      };
    }
    if (error instanceof InvestmentDomainError) {
      return { text: buildErrorReply(error.message), resultCode: "invest_error" };
    }
    throw error;
  }
}
