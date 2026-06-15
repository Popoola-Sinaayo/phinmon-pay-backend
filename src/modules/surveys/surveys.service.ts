import { v4 as uuidv4 } from "uuid";
import { Survey, ISurvey, IQuestion } from "./survey.model";
import { SurveyResponse } from "../responses/response.model";
import { Payment } from "../payments/payment.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { calculateSurveyCost, calculatePerResponseCost, isEligibleForSurvey } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";
import * as billingService from "../billing/billing.service";
import { PaymentMethod } from "../billing/paymentMethod.model";

export const createSurvey = async (
  researcherId: string,
  data: Partial<ISurvey> & { questions?: IQuestion[] }
) => {
  if (data.targetAudience === "ALL_USERS") {
    throw new AppError("ALL_USERS audience is not available in MVP", 400);
  }

  const { budget, platformFee, totalCost } = calculateSurveyCost(
    data.responsesNeeded || 0,
    data.payoutPerResponse || 0
  );

  const questions = (data.questions || []).map((q) => ({
    ...q,
    questionId: q.questionId || uuidv4(),
  }));

  const survey = await Survey.create({
    ...data,
    researcherId,
    questions,
    budget,
    platformFee,
    totalCost,
    spendingCap: data.spendingCap ?? totalCost,
    billingModel: data.billingModel || "PREPAID",
    status: "DRAFT",
  });

  return survey;
};

export const updateSurvey = async (
  researcherId: string,
  surveyId: string,
  data: Partial<ISurvey>
) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.status !== "DRAFT") throw new AppError("Only draft surveys can be edited", 400);

  if (data.responsesNeeded !== undefined || data.payoutPerResponse !== undefined) {
    const { budget, platformFee, totalCost } = calculateSurveyCost(
      data.responsesNeeded ?? survey.responsesNeeded,
      data.payoutPerResponse ?? survey.payoutPerResponse
    );
    data.budget = budget;
    data.platformFee = platformFee;
    data.totalCost = totalCost;
    if (data.spendingCap === undefined && survey.billingModel === "PAYG") {
      data.spendingCap = totalCost;
    }
  }

  Object.assign(survey, data);
  await survey.save();
  return survey;
};

export const getResearcherSurveys = async (researcherId: string) => {
  return Survey.find({ researcherId }).sort({ createdAt: -1 });
};

export const getSurveyById = async (surveyId: string, researcherId?: string) => {
  const query: Record<string, unknown> = { _id: surveyId };
  if (researcherId) query.researcherId = researcherId;
  const survey = await Survey.findOne(query);
  if (!survey) throw new AppError("Survey not found", 404);
  return survey;
};

export const launchSurvey = async (
  researcherId: string,
  surveyId: string,
  email: string,
  options?: { billingModel?: "PREPAID" | "PAYG"; spendingCap?: number }
) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.status !== "DRAFT") throw new AppError("Survey cannot be launched", 400);
  if (!survey.questions.length) throw new AppError("Survey must have questions", 400);

  if (options?.billingModel) survey.billingModel = options.billingModel;
  if (options?.spendingCap !== undefined) survey.spendingCap = options.spendingCap;
  if (survey.billingModel === "PAYG" && !survey.spendingCap) {
    survey.spendingCap = survey.totalCost;
  }
  await survey.save();

  if (survey.billingModel === "PAYG") {
    return launchPaygSurvey(researcherId, survey, email);
  }

  return launchPrepaidSurvey(researcherId, survey, email);
};

const launchPrepaidSurvey = async (
  researcherId: string,
  survey: ISurvey,
  email: string
) => {
  const reference = `IPY-${uuidv4()}`;
  const payment = await Payment.create({
    surveyId: survey._id,
    researcherId,
    amount: survey.totalCost,
    reference,
    status: "PENDING",
    purpose: "PREPAID",
    provider: "paystack",
  });

  const init = await paystackService.initializeTransaction({
    email,
    amount: survey.totalCost,
    reference,
    callbackUrl: `${config().FRONTEND_URL}/researcher/campaigns/payment/callback`,
    metadata: { surveyId: survey._id.toString(), paymentId: payment._id.toString(), purpose: "PREPAID" },
  });

  payment.paystackAccessCode = init.accessCode;
  payment.authorizationUrl = init.authorizationUrl;
  await payment.save();

  survey.status = "PENDING_PAYMENT";
  await survey.save();

  return {
    billingModel: "PREPAID" as const,
    authorizationUrl: init.authorizationUrl,
    reference: init.reference,
    amount: survey.totalCost,
  };
};

const launchPaygSurvey = async (researcherId: string, survey: ISurvey, email: string) => {
  const account = await billingService.getOrCreateBillingAccount(researcherId);

  if (account.outstandingDebt > 0) {
    throw new AppError(
      "Outstanding balance must be settled before launching a pay-as-you-go campaign",
      402
    );
  }

  const paymentMethod = account.defaultPaymentMethodId
    ? await PaymentMethod.findById(account.defaultPaymentMethodId)
    : await PaymentMethod.findOne({ researcherId, isDefault: true, isActive: true });

  if (!paymentMethod) {
    survey.status = "PENDING_PAYMENT";
    await survey.save();

    const setup = await billingService.initializeCardSetup(
      researcherId,
      email,
      survey._id.toString()
    );

    return {
      billingModel: "PAYG" as const,
      requiresCardSetup: true,
      authorizationUrl: setup.authorizationUrl,
      reference: setup.reference,
      amount: 100,
      spendingCap: survey.spendingCap,
    };
  }

  await billingService.activatePaygSurvey(survey);

  return {
    billingModel: "PAYG" as const,
    requiresCardSetup: false,
    survey,
    spendingCap: survey.spendingCap,
    perResponseCost: calculatePerResponseCost(survey.payoutPerResponse),
  };
};

export const getAvailableSurveys = async (
  userId: string,
  ninVerified: boolean,
  livenessVerified: boolean,
  filter?: string
) => {
  const completedIds = await SurveyResponse.find({ userId }).distinct("surveyId");

  let surveys = await Survey.find({
    status: "ACTIVE",
    billingLocked: { $ne: true },
    _id: { $nin: completedIds },
    $expr: { $lt: ["$responsesReceived", "$responsesNeeded"] },
  }).sort({ createdAt: -1 });

  surveys = surveys.filter((s) =>
    isEligibleForSurvey(s.targetAudience, ninVerified, livenessVerified)
  );

  if (filter === "premium") {
    surveys = surveys.filter((s) => s.targetAudience === "PREMIUM_ONLY");
  } else if (filter === "completed") {
    const completed = await SurveyResponse.find({ userId }).populate("surveyId");
    return completed.map((r) => ({
      response: r,
      survey: r.surveyId,
    }));
  } else if (filter === "highest_paying") {
    surveys.sort((a, b) => b.payoutPerResponse - a.payoutPerResponse);
  } else if (filter === "newest") {
    surveys.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return surveys;
};

export const exportSurveyResponses = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  const responses = await SurveyResponse.find({ surveyId }).populate("userId", "name email");

  const headers = ["responseId", "userId", "userName", "userEmail", "status", "rewardAmount", "createdAt"];
  const questionHeaders = survey.questions.map((q) => q.questionId);
  const allHeaders = [...headers, ...questionHeaders];

  const rows = responses.map((r) => {
    const user = r.userId as unknown as { name?: string; email?: string; _id: string };
    const row: Record<string, unknown> = {
      responseId: r._id.toString(),
      userId: user._id?.toString() || r.userId.toString(),
      userName: user.name || "",
      userEmail: user.email || "",
      status: r.status,
      rewardAmount: r.rewardAmount,
      createdAt: r.createdAt.toISOString(),
    };
    for (const q of survey.questions) {
      const answer = r.answers.find((a) => a.questionId === q.questionId);
      row[q.questionId] = answer ? JSON.stringify(answer.value) : "";
    }
    return row;
  });

  const csv = [
    allHeaders.join(","),
    ...rows.map((row) =>
      allHeaders.map((h) => `"${String(row[h] ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return { csv, filename: `survey-${surveyId}-responses.csv` };
};

export const getResearcherDashboard = async (researcherId: string) => {
  const surveys = await Survey.find({ researcherId });
  const activeCampaigns = surveys.filter((s) => s.status === "ACTIVE").length;
  const responsesReceived = surveys.reduce((sum, s) => sum + s.responsesReceived, 0);
  const fundsSpent = surveys.reduce((sum, s) => {
    if (s.billingModel === "PAYG") return sum + (s.amountSpent || 0);
    if (s.status !== "DRAFT") return sum + s.totalCost;
    return sum;
  }, 0);
  const totalNeeded = surveys.reduce((sum, s) => sum + s.responsesNeeded, 0);
  const completionRate = totalNeeded > 0 ? (responsesReceived / totalNeeded) * 100 : 0;

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const dailyResponses: Record<string, number> = {};
  for (const day of last7Days) dailyResponses[day] = 0;

  const recentResponses = await SurveyResponse.find({
    surveyId: { $in: surveys.map((s) => s._id) },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  for (const r of recentResponses) {
    const day = r.createdAt.toISOString().split("T")[0];
    if (dailyResponses[day] !== undefined) dailyResponses[day]++;
  }

  return {
    totalCampaigns: surveys.length,
    activeCampaigns,
    responsesReceived,
    fundsSpent,
    completionRate: Math.round(completionRate * 100) / 100,
    dailyResponses: last7Days.map((date) => ({ date, count: dailyResponses[date] })),
  };
};
