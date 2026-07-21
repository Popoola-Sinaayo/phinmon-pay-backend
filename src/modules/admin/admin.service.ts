import mongoose, { FilterQuery } from "mongoose";
import config from "../../config";
import { platformReminderEmailTemplate } from "../../emails/templates";
import { getEmailProvider } from "../../providers/email";
import { AppError } from "../../utils/errors";
import { sanitizeUser } from "../../utils/helpers";
import { createLogger } from "../../utils/logger";
import { Survey } from "../surveys/survey.model";
import { IUser, User } from "../users/user.model";
import { Transaction } from "../wallets/transaction.model";
import { Withdrawal } from "../wallets/withdrawal.model";
import { FraudFlag } from "./fraudFlag.model";
import { logAudit } from "./auditLog.model";
import { AdminEmailCampaign } from "./adminEmailCampaign.model";

const log = createLogger("Admin");
const EMAIL_BATCH_SIZE = 15;

export type UserListFilters = {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  ninVerified?: boolean;
  livenessVerified?: boolean;
  q?: string;
};

export type EmailAudience =
  | "all"
  | "unverified"
  | "verified"
  | "pending_verification"
  | "respondents"
  | "researchers"
  | "premium"
  | "specific_users"
  | "signed_up_since";

export type ReminderTemplate = "use_platform" | "complete_verification" | "custom";

export type EmailTargetParams = {
  audience: EmailAudience;
  userIds?: string[];
  signedUpSince?: string;
};

const daysAgo = (days: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
};

const fillDailySeries = (
  rows: Array<{ _id: string; count: number; amount?: number }>,
  days: number
) => {
  const map = new Map(rows.map((r) => [r._id, r]));
  const series: Array<{ date: string; count: number; amount: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    series.push({
      date: key,
      count: row?.count ?? 0,
      amount: row?.amount ?? 0,
    });
  }
  return series;
};

const dailyGroupStage = {
  $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    count: { $sum: 1 },
  },
};

const dailyAmountGroupStage = {
  $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
    count: { $sum: 1 },
    amount: { $sum: "$amount" },
  },
};

export const listUsers = async (filters: UserListFilters = {}) => {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const skip = (page - 1) * limit;

  const query: FilterQuery<IUser> = {};
  if (filters.role) query.role = filters.role;
  if (filters.status) query.status = filters.status;
  if (filters.ninVerified !== undefined) query.ninVerified = filters.ninVerified;
  if (filters.livenessVerified !== undefined) {
    query.livenessVerified = filters.livenessVerified;
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query.$or = [
      { email: { $regex: q, $options: "i" } },
      { name: { $regex: q, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(query),
  ]);

  return {
    users: users.map(sanitizeUser),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
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
  const since30 = daysAgo(30);
  const since7 = daysAgo(7);

  const [
    users,
    surveys,
    transactions,
    withdrawals,
    fraudFlags,
    usersByStatus,
    usersByRole,
    ninVerifiedCount,
    livenessVerifiedCount,
    pendingVerificationCount,
    surveysByStatus,
    withdrawalsByStatus,
    signupRows,
    transactionRows,
    withdrawalRows,
    newUsers7d,
    newUsers30d,
    earningsAgg,
    withdrawalsAgg,
    activeSurveys,
  ] = await Promise.all([
    User.countDocuments(),
    Survey.countDocuments(),
    Transaction.countDocuments(),
    Withdrawal.countDocuments(),
    FraudFlag.countDocuments({ resolved: false }),
    User.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]),
    User.countDocuments({ ninVerified: true }),
    User.countDocuments({ livenessVerified: true }),
    User.countDocuments({ status: "PENDING_VERIFICATION" }),
    Survey.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Withdrawal.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    User.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      dailyGroupStage,
      { $sort: { _id: 1 } },
    ]),
    Transaction.aggregate([
      { $match: { createdAt: { $gte: since30 }, status: "COMPLETED" } },
      dailyAmountGroupStage,
      { $sort: { _id: 1 } },
    ]),
    Withdrawal.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      dailyAmountGroupStage,
      { $sort: { _id: 1 } },
    ]),
    User.countDocuments({ createdAt: { $gte: since7 } }),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    Transaction.aggregate([
      { $match: { type: "EARNING", status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Withdrawal.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Survey.countDocuments({ status: "ACTIVE" }),
  ]);

  const toBreakdown = (rows: Array<{ _id: string; count: number }>) =>
    rows
      .filter((r) => r._id != null)
      .map((r) => ({ label: String(r._id), count: r.count }))
      .sort((a, b) => b.count - a.count);

  return {
    users,
    surveys,
    transactions,
    withdrawals,
    fraudFlags,
    activeSurveys,
    newUsers7d,
    newUsers30d,
    totalEarnings: earningsAgg[0]?.total ?? 0,
    totalWithdrawn: withdrawalsAgg[0]?.total ?? 0,
    verification: {
      ninVerified: ninVerifiedCount,
      ninUnverified: Math.max(0, users - ninVerifiedCount),
      livenessVerified: livenessVerifiedCount,
      pendingVerification: pendingVerificationCount,
    },
    usersByStatus: toBreakdown(usersByStatus),
    usersByRole: toBreakdown(usersByRole),
    surveysByStatus: toBreakdown(surveysByStatus),
    withdrawalsByStatus: toBreakdown(withdrawalsByStatus),
    signupsByDay: fillDailySeries(signupRows, 30),
    transactionsByDay: fillDailySeries(transactionRows, 30),
    withdrawalsByDay: fillDailySeries(withdrawalRows, 30),
  };
};

const audienceQuery = (params: EmailTargetParams): FilterQuery<IUser> => {
  const base: FilterQuery<IUser> = { status: { $ne: "SUSPENDED" }, role: { $ne: "admin" } };

  if (params.audience === "specific_users") {
    const ids = (params.userIds || []).filter(Boolean);
    if (ids.length === 0) {
      throw new AppError("Select at least one user", 400);
    }
    return {
      ...base,
      _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
    };
  }

  if (params.audience === "signed_up_since") {
    if (!params.signedUpSince) {
      throw new AppError("Select a start date for signups", 400);
    }
    const since = new Date(params.signedUpSince);
    if (Number.isNaN(since.getTime())) {
      throw new AppError("Invalid signup date", 400);
    }
    since.setUTCHours(0, 0, 0, 0);
    return { ...base, createdAt: { $gte: since } };
  }

  switch (params.audience) {
    case "all":
      return base;
    case "unverified":
      return { ...base, ninVerified: false };
    case "verified":
      return { ...base, ninVerified: true };
    case "pending_verification":
      return { ...base, status: "PENDING_VERIFICATION" };
    case "respondents":
      return { ...base, role: "respondent" };
    case "researchers":
      return { ...base, role: "researcher" };
    case "premium":
      return { ...base, livenessVerified: true };
    default:
      throw new AppError("Invalid email audience", 400);
  }
};

const audienceLabel = (params: EmailTargetParams, count?: number): string => {
  if (params.audience === "specific_users") {
    return `${count ?? params.userIds?.length ?? 0} selected user(s)`;
  }
  if (params.audience === "signed_up_since" && params.signedUpSince) {
    const d = new Date(params.signedUpSince);
    const formatted = Number.isNaN(d.getTime())
      ? params.signedUpSince
      : d.toLocaleDateString("en-NG", { dateStyle: "medium" });
    return `users who signed up since ${formatted}`;
  }
  const labels: Record<Exclude<EmailAudience, "specific_users" | "signed_up_since">, string> = {
    all: "all users",
    unverified: "unverified users",
    verified: "verified users",
    pending_verification: "users pending verification",
    respondents: "respondents",
    researchers: "researchers",
    premium: "premium users",
  };
  return labels[params.audience as Exclude<EmailAudience, "specific_users" | "signed_up_since">];
};

export const previewEmailAudience = async (params: EmailTargetParams) => {
  const query = audienceQuery(params);
  const count = await User.countDocuments(query);
  return {
    audience: params.audience,
    label: audienceLabel(params, count),
    count,
    signedUpSince: params.signedUpSince,
    userIds: params.userIds,
  };
};

export const listEmailCampaigns = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [campaigns, total] = await Promise.all([
    AdminEmailCampaign.find()
      .populate("sentBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AdminEmailCampaign.countDocuments(),
  ]);
  return {
    campaigns,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const sendBulkReminderEmail = async (params: {
  audience: EmailAudience;
  userIds?: string[];
  signedUpSince?: string;
  template: ReminderTemplate;
  subject?: string;
  message?: string;
  headline?: string;
  ctaLabel?: string;
  adminUserId?: string;
}) => {
  const target: EmailTargetParams = {
    audience: params.audience,
    userIds: params.userIds,
    signedUpSince: params.signedUpSince,
  };
  const query = audienceQuery(target);
  const users = await User.find(query).select("email name _id");

  if (users.length === 0) {
    throw new AppError("No recipients match this audience", 400);
  }

  if (params.template === "custom" && (!params.subject?.trim() || !params.message?.trim())) {
    throw new AppError("Custom emails require a subject and message", 400);
  }

  const dashboardUrl = `${config().FRONTEND_URL}/dashboard`;
  const verifyUrl = `${config().FRONTEND_URL}/verification`;
  const emailProvider = getEmailProvider();
  const label = audienceLabel(target, users.length);
  const subjectForLog =
    params.template === "custom"
      ? (params.subject || "Custom message").trim()
      : params.template === "complete_verification"
        ? "Complete your Phinmon verification"
        : "Reminder: use Phinmon today";

  let sent = 0;
  let failed = 0;

  log.info("Starting admin bulk email", {
    audience: params.audience,
    template: params.template,
    recipientCount: users.length,
  });

  for (let i = 0; i < users.length; i += EMAIL_BATCH_SIZE) {
    const batch = users.slice(i, i + EMAIL_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (user) => {
        const { subject, html } = platformReminderEmailTemplate({
          recipientName: user.name,
          template: params.template,
          customSubject: params.subject,
          customMessage: params.message,
          customHeadline: params.headline,
          ctaLabel: params.ctaLabel,
          dashboardUrl,
          verifyUrl,
        });
        await emailProvider.send({ to: user.email, subject, html });
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") sent += 1;
      else {
        failed += 1;
        log.warn("Failed to send admin reminder email", {
          error: (result.reason as Error)?.message,
        });
      }
    }
  }

  const status = sent === 0 ? "failed" : failed > 0 ? "partial" : "completed";

  const campaign = await AdminEmailCampaign.create({
    sentBy: params.adminUserId,
    audience: params.audience,
    audienceLabel: label,
    template: params.template,
    subject: subjectForLog,
    messagePreview: params.message?.trim().slice(0, 280),
    headline: params.headline?.trim(),
    userIds:
      params.audience === "specific_users" ? users.map((u) => u._id) : undefined,
    signedUpSince:
      params.audience === "signed_up_since" && params.signedUpSince
        ? new Date(params.signedUpSince)
        : undefined,
    totalRecipients: users.length,
    sent,
    failed,
    status,
  });

  if (params.adminUserId) {
    await logAudit({
      userId: new mongoose.Types.ObjectId(params.adminUserId),
      action: "BULK_EMAIL_SENT",
      resource: "admin_email_campaign",
      resourceId: campaign._id.toString(),
      metadata: {
        audience: params.audience,
        template: params.template,
        sent,
        failed,
        total: users.length,
      },
    });
  }

  log.info("Admin bulk email complete", {
    audience: params.audience,
    template: params.template,
    sent,
    failed,
    total: users.length,
  });

  return {
    campaignId: campaign._id.toString(),
    audience: params.audience,
    label,
    total: users.length,
    sent,
    failed,
    status,
  };
};
