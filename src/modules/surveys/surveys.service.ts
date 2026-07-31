import { v4 as uuidv4 } from "uuid";
import { Survey, ISurvey, IQuestion, SurveyAudience } from "./survey.model";
import { SurveyResponse } from "../responses/response.model";
import { Payment } from "../payments/payment.model";
import { User } from "../users/user.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { isPremiumAudienceEnabled } from "../../providers/liveness";
import {
  computeSurveyPricing,
  getQuestionTimeBreakdown,
  isVisibleSurvey,
  normalizeQuestionType,
} from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";

const normalizeQuestions = (questions: IQuestion[]): IQuestion[] =>
  questions.map((q) => ({
    ...q,
    questionId: q.questionId || uuidv4(),
    type: normalizeQuestionType(q.type),
  }));

const applyPricing = (
  surveyData: {
    questions: IQuestion[];
    responsesNeeded: number;
    targetAudience: SurveyAudience;
    aiSpamFilterEnabled?: boolean;
    aiAnalyticsEnabled?: boolean;
  }
) => {
  const pricing = computeSurveyPricing(
    surveyData.questions,
    surveyData.responsesNeeded,
    surveyData.targetAudience,
    {
      aiSpamFilterEnabled: surveyData.aiSpamFilterEnabled ?? false,
      aiAnalyticsEnabled: surveyData.aiAnalyticsEnabled ?? false,
    }
  );

  return {
    ...pricing,
    budget: pricing.budget,
    platformFee: pricing.platformFeeAmount,
    platformFeeAmount: pricing.platformFeeAmount,
    platformFeeRate: pricing.platformFeeRate,
    totalCost: pricing.totalCost,
    payoutPerResponse: pricing.payoutPerResponse,
    rewardPerResponseStandard: pricing.rewardPerResponseStandard,
    rewardPerResponsePremium: pricing.rewardPerResponsePremium,
    estimatedCompletionTimeSeconds: pricing.estimatedCompletionTimeSeconds,
    estimatedCompletionTimeMinutes: pricing.estimatedCompletionTimeMinutes,
    estimatedMinutes: pricing.estimatedMinutes,
    highComplexity: pricing.highComplexity,
    aiSpamFilterEnabled: pricing.aiSpamFilterEnabled,
    aiAnalyticsEnabled: pricing.aiAnalyticsEnabled,
    aiAddOnsCost: pricing.aiAddOnsCost,
    aiSpamFilterCost: pricing.aiSpamFilterCost,
    aiAnalyticsCost: pricing.aiAnalyticsCost,
  };
};

export const previewSurveyCost = (data: {
  questions: IQuestion[];
  responsesNeeded: number;
  targetAudience: SurveyAudience;
  aiSpamFilterEnabled?: boolean;
  aiAnalyticsEnabled?: boolean;
}) => {
  const questions = normalizeQuestions(data.questions || []);
  const pricing = applyPricing({
    questions,
    responsesNeeded: data.responsesNeeded,
    targetAudience: data.targetAudience,
    aiSpamFilterEnabled: data.aiSpamFilterEnabled,
    aiAnalyticsEnabled: data.aiAnalyticsEnabled,
  });
  return {
    ...pricing,
    questionBreakdown: getQuestionTimeBreakdown(questions),
  };
};

export const getSurveyPaymentStatus = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  const payment = await Payment.findOne({
    surveyId: survey._id,
    purpose: "PREPAID",
  }).sort({ createdAt: -1 });

  if (!payment) {
    return { surveyStatus: survey.status, payment: null };
  }

  return {
    surveyStatus: survey.status,
    payment: {
      reference: payment.reference,
      status: payment.status,
      amount: payment.amount,
      authorizationUrl: payment.authorizationUrl,
      createdAt: payment.createdAt,
    },
  };
};

const assertPremiumAudienceAllowed = (targetAudience?: SurveyAudience) => {
  if (targetAudience === "PREMIUM_ONLY" && !isPremiumAudienceEnabled()) {
    throw new AppError(
      "Premium respondent targeting is coming soon. Use verified (NIN) respondents for now.",
      400
    );
  }
};

export const createSurvey = async (
  researcherId: string,
  data: Partial<ISurvey> & { questions?: IQuestion[] }
) => {
  if (data.targetAudience === "ALL_USERS") {
    throw new AppError("ALL_USERS audience is not available in MVP", 400);
  }

  const targetAudience = (data.targetAudience || "ALL_VERIFIED") as SurveyAudience;
  assertPremiumAudienceAllowed(targetAudience);
  const responsesNeeded = data.responsesNeeded || 1;
  const questions = normalizeQuestions(data.questions || []);
  const pricing = applyPricing({
    questions,
    responsesNeeded,
    targetAudience,
    aiSpamFilterEnabled: data.aiSpamFilterEnabled ?? false,
    aiAnalyticsEnabled: data.aiAnalyticsEnabled ?? false,
  });

  const survey = await Survey.create({
    title: data.title,
    description: data.description,
    category: data.category,
    researcherId,
    targetAudience,
    responsesNeeded,
    questions,
    billingModel: "PREPAID",
    status: "DRAFT",
    draftStep: data.draftStep ?? 0,
    ...pricing,
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

  const editableStatuses = ["DRAFT", "PENDING_PAYMENT"];
  if (!editableStatuses.includes(survey.status)) {
    throw new AppError("Only draft or pending-payment surveys can be edited", 400);
  }

  if (survey.status === "PENDING_PAYMENT" && data.questions !== undefined) {
    throw new AppError("Questions cannot be changed after payment has been initiated", 400);
  }

  if (data.title !== undefined) survey.title = data.title;
  if (data.description !== undefined) survey.description = data.description;
  if (data.category !== undefined) survey.category = data.category;
  if (data.targetAudience !== undefined) {
    assertPremiumAudienceAllowed(data.targetAudience as SurveyAudience);
    survey.targetAudience = data.targetAudience;
  }
  if (data.responsesNeeded !== undefined) survey.responsesNeeded = data.responsesNeeded;
  if (data.aiSpamFilterEnabled !== undefined) survey.aiSpamFilterEnabled = data.aiSpamFilterEnabled;
  if (data.aiAnalyticsEnabled !== undefined) survey.aiAnalyticsEnabled = data.aiAnalyticsEnabled;
  if (data.draftStep !== undefined) survey.draftStep = data.draftStep;
  if (data.questions !== undefined && survey.status === "DRAFT") {
    survey.questions = normalizeQuestions(data.questions);
  }

  const pricing = applyPricing({
    questions: survey.questions,
    responsesNeeded: survey.responsesNeeded,
    targetAudience: survey.targetAudience,
    aiSpamFilterEnabled: survey.aiSpamFilterEnabled,
    aiAnalyticsEnabled: survey.aiAnalyticsEnabled,
  });

  Object.assign(survey, pricing);
  await survey.save();
  return survey;
};

export const getRespondentPoolStats = async () => {
  const baseQuery = {
    role: "respondent" as const,
    ninVerified: true,
    status: { $ne: "SUSPENDED" as const },
  };

  const [verifiedRespondents, premiumRespondents] = await Promise.all([
    User.countDocuments(baseQuery),
    User.countDocuments({ ...baseQuery, livenessVerified: true }),
  ]);

  return { verifiedRespondents, premiumRespondents };
};

export const getResearcherSurveys = async (researcherId: string) => {
  return Survey.find({ researcherId }).sort({ createdAt: -1 });
};

export const getSurveyById = async (surveyId: string, researcherId?: string) => {
  const query: Record<string, unknown> = { _id: surveyId };
  if (researcherId) query.researcherId = researcherId;
  const survey = await Survey.findOne(query);
  if (!survey) throw new AppError("Survey not found", 404);
  const obj = survey.toObject();
  return {
    ...obj,
    isFull: survey.responsesReceived >= survey.responsesNeeded,
  };
};

const resumePrepaidPayment = async (survey: ISurvey) => {
  const pending = await Payment.findOne({
    surveyId: survey._id,
    purpose: "PREPAID",
    status: "PENDING",
  }).sort({ createdAt: -1 });

  if (pending?.authorizationUrl) {
    return {
      billingModel: "PREPAID" as const,
      authorizationUrl: pending.authorizationUrl,
      reference: pending.reference,
      amount: pending.amount,
      resumed: true,
    };
  }

  throw new AppError("No pending payment found for this survey", 400);
};

export const launchSurvey = async (
  researcherId: string,
  surveyId: string,
  email: string
) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  if (survey.status === "PENDING_PAYMENT") {
    return resumePrepaidPayment(survey);
  }

  if (survey.status !== "DRAFT") throw new AppError("Survey cannot be launched", 400);
  if (!survey.questions.length) throw new AppError("Survey must have questions", 400);
  if (!survey.estimatedCompletionTimeSeconds) {
    throw new AppError("Survey must have computed estimated time before launch", 400);
  }

  const pricing = applyPricing({
    questions: survey.questions,
    responsesNeeded: survey.responsesNeeded,
    targetAudience: survey.targetAudience,
    aiSpamFilterEnabled: survey.aiSpamFilterEnabled,
    aiAnalyticsEnabled: survey.aiAnalyticsEnabled,
  });
  Object.assign(survey, pricing);
  survey.billingModel = "PREPAID";
  await survey.save();

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

export const purchaseAnalyticsAddon = async (
  researcherId: string,
  surveyId: string,
  email: string
) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.aiAnalyticsEnabled) {
    throw new AppError("AI analytics is already enabled for this survey", 400);
  }

  const cfg = config();
  if (!cfg.FEATURE_AI_ANALYTICS) {
    throw new AppError("AI analytics is not available on this platform", 503);
  }

  const amount = cfg.AI_ANALYTICS_COST;
  const reference = `IPY-AIA-${uuidv4()}`;
  const payment = await Payment.create({
    surveyId: survey._id,
    researcherId,
    amount,
    reference,
    status: "PENDING",
    purpose: "AI_ANALYTICS_ADDON",
    provider: "paystack",
  });

  const init = await paystackService.initializeTransaction({
    email,
    amount,
    reference,
    callbackUrl: `${cfg.FRONTEND_URL}/researcher/campaigns/payment/callback`,
    metadata: {
      surveyId: survey._id.toString(),
      paymentId: payment._id.toString(),
      purpose: "AI_ANALYTICS_ADDON",
    },
  });

  payment.paystackAccessCode = init.accessCode;
  payment.authorizationUrl = init.authorizationUrl;
  await payment.save();

  return {
    authorizationUrl: init.authorizationUrl,
    reference: init.reference,
    amount,
  };
};

export const getAvailableSurveys = async (
  userId: string,
  _ninVerified: boolean,
  livenessVerified: boolean,
  filter?: string
) => {
  const completedIds = await SurveyResponse.find({ userId }).distinct("surveyId");
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Open slots always; filled surveys stay visible for 1 week after creation.
  let surveys = await Survey.find({
    status: "ACTIVE",
    billingLocked: { $ne: true },
    _id: { $nin: completedIds },
    $or: [
      { $expr: { $lt: ["$responsesReceived", "$responsesNeeded"] } },
      {
        $and: [
          { $expr: { $gte: ["$responsesReceived", "$responsesNeeded"] } },
          { createdAt: { $gte: weekAgo } },
        ],
      },
    ],
  }).sort({ createdAt: -1 });

  surveys = surveys.filter((s) => isVisibleSurvey(s.targetAudience));

  if (!livenessVerified) {
    surveys = surveys.filter((s) => s.targetAudience !== "PREMIUM_ONLY");
  }

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

  return surveys.map((s) => {
    const obj = s.toObject();
    return {
      ...obj,
      isFull: s.responsesReceived >= s.responsesNeeded,
    };
  });
};

export const exportSurveyResponses = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  const responses = await SurveyResponse.find({ surveyId }).populate(
    "userId",
    "ninVerified livenessVerified"
  );

  const headers = [
    "responseId",
    "userId",
    "ninVerified",
    "livenessVerified",
    "status",
    "rewardAmount",
    "createdAt",
  ];
  const questionHeaders = survey.questions.map((q) => q.questionId);
  const allHeaders = [...headers, ...questionHeaders];

  const rows = responses.map((r) => {
    const user = r.userId as unknown as {
      ninVerified?: boolean;
      livenessVerified?: boolean;
      _id: string;
    };
    const row: Record<string, unknown> = {
      responseId: r._id.toString(),
      userId: user._id?.toString() || r.userId.toString(),
      ninVerified: Boolean(user.ninVerified),
      livenessVerified: Boolean(user.livenessVerified),
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

export const pauseSurvey = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.status !== "ACTIVE") {
    throw new AppError("Only active projects can be paused", 400);
  }
  if (survey.billingLocked) {
    throw new AppError(
      survey.billingLockReason || "This project is locked due to a billing issue",
      400
    );
  }

  survey.status = "PAUSED";
  await survey.save();
  return survey;
};

export const resumeSurvey = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.status !== "PAUSED") {
    throw new AppError("Only paused projects can be resumed", 400);
  }
  if (survey.billingLocked) {
    throw new AppError(
      survey.billingLockReason ||
        "This project is locked due to a billing issue and cannot be resumed yet",
      400
    );
  }
  if (survey.responsesReceived >= survey.responsesNeeded) {
    throw new AppError("This project has already collected all needed responses", 400);
  }

  survey.status = "ACTIVE";
  await survey.save();
  return survey;
};

export const getResearcherDashboard = async (researcherId: string) => {
  const surveys = await Survey.find({ researcherId });
  const activeCampaigns = surveys.filter((s) => s.status === "ACTIVE").length;
  const responsesReceived = surveys.reduce((sum, s) => sum + s.responsesReceived, 0);
  const fundsSpent = surveys.reduce((sum, s) => {
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
