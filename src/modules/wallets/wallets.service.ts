import { v4 as uuidv4 } from "uuid";
import { Wallet } from "./wallet.model";
import { Transaction } from "./transaction.model";
import { Withdrawal } from "./withdrawal.model";
import { BankAccount } from "./bankAccount.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { AppError } from "../../utils/errors";
import config from "../../config";
import { User } from "../users/user.model";
import { isValidPinFormat, verifyPin } from "../../utils/pin";
import {
  syncPendingWithdrawalsForUser,
  syncWithdrawalFromPaystack,
} from "./withdrawalSync";
import { createLogger } from "../../utils/logger";

const log = createLogger("Wallets");

export const getWallet = async (userId: string) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId });
  }
  return wallet;
};

export const getTransactions = async (userId: string, limit = 50) => {
  await syncPendingWithdrawalsForUser(userId);
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
  userId: string,
  amount: number,
  bankId: string,
  pin: string
) => {
  const user = await User.findById(userId).select("+withdrawalPinHash");
  if (!user) throw new AppError("User not found", 404);
  if (user.deletionRequestedAt) {
    throw new AppError(
      "Account deletion is pending. Withdrawals are paused until the request is resolved.",
      403,
      { code: "DELETION_PENDING" }
    );
  }
  if (!user.ninVerified) throw new AppError("NIN verification required for withdrawals", 403);

  if (!user.withdrawalPinHash) {
    throw new AppError("Withdrawal PIN not set. Please set a PIN first.", 403, {
      code: "PIN_NOT_SET",
    });
  }
  if (!isValidPinFormat(pin)) {
    throw new AppError("PIN must be 4–6 digits", 400);
  }
  const pinValid = await verifyPin(pin, user.withdrawalPinHash);
  if (!pinValid) {
    throw new AppError("Incorrect withdrawal PIN", 403, { code: "PIN_INVALID" });
  }

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

    log.info("Paystack transfer initiated", {
      reference,
      transferCode: transfer.transferCode,
      initialPaystackStatus: transfer.status,
      amount,
    });

    withdrawal.paystackTransferCode = transfer.transferCode;
    if (transfer.status === "success" || !paystackService.isConfigured()) {
      withdrawal.status = "COMPLETED";
      await Transaction.findOneAndUpdate({ reference }, { status: "COMPLETED" });
    } else {
      withdrawal.status = "PROCESSING";
    }
    await withdrawal.save();
    await syncWithdrawalFromPaystack(withdrawal);

    const finalTx = await Transaction.findOne({ reference });
    log.info("Withdrawal request complete", {
      reference,
      withdrawalStatus: withdrawal.status,
      transactionStatus: finalTx?.status,
      transferCode: withdrawal.paystackTransferCode,
    });
  } catch (error) {
    log.error("Withdrawal initiation failed", {
      reference,
      error: (error as Error).message,
    });
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

export const getWithdrawalStatus = async (userId: string, withdrawalId: string) => {
  log.info("Poll withdrawal status", { userId, withdrawalId });

  const withdrawal = await Withdrawal.findOne({ _id: withdrawalId, userId });
  if (!withdrawal) throw new AppError("Withdrawal not found", 404);

  const synced = await syncWithdrawalFromPaystack(withdrawal);
  const fresh = await Withdrawal.findById(withdrawalId);
  const transaction = await Transaction.findOne({ reference: synced.reference });

  log.info("Poll withdrawal status result", {
    withdrawalId,
    reference: synced.reference,
    withdrawalStatus: fresh?.status || synced.status,
    transactionStatus: transaction?.status || "NOT_FOUND",
  });

  return {
    withdrawal: fresh || synced,
    transactionStatus: transaction?.status || "PENDING",
    paystackSynced: true,
  };
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
