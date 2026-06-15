import { User } from "../users/user.model";
import { Survey } from "../surveys/survey.model";
import { Transaction } from "../wallets/transaction.model";
import { Withdrawal } from "../wallets/withdrawal.model";
import { FraudFlag } from "./fraudFlag.model";
import { AppError } from "../../utils/errors";
import { sanitizeUser } from "../../utils/helpers";

export const listUsers = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(),
  ]);
  return { users: users.map(sanitizeUser), total, page, limit };
};

export const updateUser = async (userId: string, data: Record<string, unknown>) => {
  const allowed = ["role", "ninVerified", "livenessVerified", "status", "name"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }
  const user = await User.findByIdAndUpdate(userId, update, { new: true });
  if (!user) throw new AppError("User not found", 404);
  return sanitizeUser(user);
};

export const listSurveys = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [surveys, total] = await Promise.all([
    Survey.find().populate("researcherId", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Survey.countDocuments(),
  ]);
  return { surveys, total, page, limit };
};

export const updateSurveyStatus = async (surveyId: string, status: string) => {
  const survey = await Survey.findByIdAndUpdate(surveyId, { status }, { new: true });
  if (!survey) throw new AppError("Survey not found", 404);
  return survey;
};

export const listTransactions = async (page = 1, limit = 50) => {
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    Transaction.find().populate("userId", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Transaction.countDocuments(),
  ]);
  return { transactions, total, page, limit };
};

export const listWithdrawals = async (page = 1, limit = 50) => {
  const skip = (page - 1) * limit;
  const [withdrawals, total] = await Promise.all([
    Withdrawal.find().populate("userId", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
    Withdrawal.countDocuments(),
  ]);
  return { withdrawals, total, page, limit };
};

export const getVerificationQueue = async () => {
  return User.find({
    $or: [{ ninVerified: false }, { livenessVerified: false }],
  })
    .select("name email ninVerified livenessVerified status createdAt")
    .sort({ createdAt: -1 })
    .limit(100);
};

export const getFraudFlags = async () => {
  return FraudFlag.find({ resolved: false })
    .populate("userId", "name email")
    .sort({ createdAt: -1 })
    .limit(100);
};

export const getAdminStats = async () => {
  const [users, surveys, transactions, withdrawals, fraudFlags] = await Promise.all([
    User.countDocuments(),
    Survey.countDocuments(),
    Transaction.countDocuments(),
    Withdrawal.countDocuments(),
    FraudFlag.countDocuments({ resolved: false }),
  ]);
  return { users, surveys, transactions, withdrawals, fraudFlags };
};
