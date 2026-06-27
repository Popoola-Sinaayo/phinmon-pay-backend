import { v4 as uuidv4 } from "uuid";
import { Wallet } from "./wallet.model";
import { Transaction } from "./transaction.model";
import { Withdrawal } from "./withdrawal.model";
import { BankAccount } from "./bankAccount.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { AppError } from "../../utils/errors";
import config from "../../config";
import { IUser } from "../users/user.model";

export const getWallet = async (userId: string) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const getTransactions = async (userId: string, limit = 50) => {
  return Transaction.find({ userId }).sort({ createdAt: -1 }).limit(limit);
};

export const resolveBankAccount = async (accountNumber: string, bankCode: string) => {
  try {
    const resolved = await paystackService.resolveAccount(accountNumber, bankCode);
    return { accountName: resolved.accountName, accountNumber: resolved.accountNumber };
  } catch {
    throw new AppError(
      "Could not verify account. Please check the account number and bank.",
      422
    );
  }
};

export const addBankAccount = async (
  userId: string,
  data: { bankName: string; bankCode: string; accountNumber: string }
) => {
  const resolved = await paystackService.resolveAccount(data.accountNumber, data.bankCode);
  const recipient = await paystackService.createTransferRecipient({
    name: resolved.accountName,
    accountNumber: data.accountNumber,
    bankCode: data.bankCode,
  });

  const existing = await BankAccount.findOne({ userId, accountNumber: data.accountNumber });
  if (existing) throw new AppError("Bank account already added", 409);

  const account = await BankAccount.create({
    userId,
    bankName: data.bankName,
    bankCode: data.bankCode,
    accountNumber: data.accountNumber,
    accountName: resolved.accountName,
    recipientCode: recipient.recipientCode,
    isDefault: (await BankAccount.countDocuments({ userId })) === 0,
  });

  return account;
};

export const getBankAccounts = async (userId: string) => {
  return BankAccount.find({ userId }).sort({ isDefault: -1, createdAt: -1 });
};

export const requestWithdrawal = async (
  user: IUser,
  amount: number,
  bankId: string
) => {
  if (!user.ninVerified) throw new AppError("NIN verification required for withdrawals", 403);

  const minAmount = config().MIN_WITHDRAWAL_AMOUNT;
  if (amount < minAmount) {
    throw new AppError(`Minimum withdrawal amount is ₦${minAmount}`, 400);
  }

  const wallet = await getWallet(user._id.toString());
  if (wallet.availableBalance < amount) {
    throw new AppError("Insufficient balance", 400);
  }

  const bank = await BankAccount.findOne({ _id: bankId, userId: user._id });
  if (!bank || !bank.recipientCode) {
    throw new AppError("Valid bank account required", 400);
  }

  const reference = `WDR-${uuidv4()}`;
  const withdrawal = await Withdrawal.create({
    userId: user._id,
    amount,
    bankId: bank._id,
    reference,
    status: "PROCESSING",
  });

  wallet.availableBalance -= amount;
  await wallet.save();

  await Transaction.create({
    userId: user._id,
    type: "WITHDRAWAL",
    amount: -amount,
    reference,
    status: "PENDING",
    description: `Withdrawal to ${bank.bankName} ****${bank.accountNumber.slice(-4)}`,
    metadata: { withdrawalId: withdrawal._id, bankId: bank._id },
  });

  try {
    const transfer = await paystackService.initiateTransfer({
      amount,
      recipientCode: bank.recipientCode,
      reference,
      reason: "Phinmon earnings withdrawal",
    });

    withdrawal.paystackTransferCode = transfer.transferCode;
    if (transfer.status === "success" || !paystackService.isConfigured()) {
      withdrawal.status = "COMPLETED";
      await Transaction.findOneAndUpdate({ reference }, { status: "COMPLETED" });
    }
    await withdrawal.save();
  } catch (error) {
    withdrawal.status = "FAILED";
    wallet.availableBalance += amount;
    await Promise.all([
      withdrawal.save(),
      wallet.save(),
      Transaction.findOneAndUpdate({ reference }, { status: "FAILED" }),
    ]);
    console.log(error);
    throw new AppError("Withdrawal failed. Amount restored to wallet.", 500);
  }

  return withdrawal;
};

export const getRespondentDashboard = async (userId: string) => {
  const wallet = await getWallet(userId);
  const { Survey } = await import("../surveys/survey.model");
  const { SurveyResponse } = await import("../responses/response.model");
  const { User } = await import("../users/user.model");

  const user = await User.findById(userId);
  const completedCount = await SurveyResponse.countDocuments({ userId });
  const recentEarnings = await Transaction.find({
    userId,
    type: "EARNING",
    status: "COMPLETED",
  })
    .sort({ createdAt: -1 })
    .limit(5);

  const availableSurveys = await Survey.countDocuments({ status: "ACTIVE" });

  return {
    wallet,
    availableSurveys,
    completedSurveys: completedCount,
    isPremium: user?.livenessVerified || false,
    verificationStatus: {
      ninVerified: user?.ninVerified || false,
      livenessVerified: user?.livenessVerified || false,
      status: user?.status,
    },
    recentEarnings,
  };
};

export const listBanks = async () => {
  return paystackService.listBanks();
};
