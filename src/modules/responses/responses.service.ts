import { v4 as uuidv4 } from "uuid";
import { Survey } from "../surveys/survey.model";
import { SurveyResponse } from "./response.model";
import { Wallet } from "../wallets/wallet.model";
import { Transaction } from "../wallets/transaction.model";
import { FraudFlag } from "../admin/fraudFlag.model";
import { isEligibleForSurvey } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";
import { IUser } from "../users/user.model";

const RAPID_SUBMIT_WINDOW_MS = 60 * 1000;
const RAPID_SUBMIT_THRESHOLD = 3;

export const submitResponse = async (
  user: IUser,
  surveyId: string,
  answers: Array<{ questionId: string; type: string; value: unknown }>
) => {
  if (!user.ninVerified) throw new AppError("NIN verification required", 403);

  const survey = await Survey.findById(surveyId);
  if (!survey) throw new AppError("Survey not found", 404);
  if (survey.status !== "ACTIVE") throw new AppError("Survey is not active", 400);
  if (survey.billingLocked) throw new AppError("Survey is temporarily unavailable", 400);
  if (survey.responsesReceived >= survey.responsesNeeded) {
    throw new AppError("Survey has reached maximum responses", 400);
  }

  if (!isEligibleForSurvey(survey.targetAudience, user.ninVerified, user.livenessVerified)) {
    throw new AppError("You are not eligible for this survey", 403);
  }

  const existing = await SurveyResponse.findOne({ surveyId, userId: user._id });
  if (existing) throw new AppError("You have already submitted this survey", 409);

  for (const q of survey.questions) {
    if (q.required) {
      const answer = answers.find((a) => a.questionId === q.questionId);
      if (!answer || answer.value === "" || answer.value === null) {
        throw new AppError(`Question "${q.questionText}" is required`, 400);
      }
    }
  }

  const recentCount = await SurveyResponse.countDocuments({
    userId: user._id,
    createdAt: { $gte: new Date(Date.now() - RAPID_SUBMIT_WINDOW_MS) },
  });

  if (recentCount >= RAPID_SUBMIT_THRESHOLD) {
    await FraudFlag.create({
      userId: user._id,
      reason: "Rapid survey submissions detected",
      severity: "medium",
      metadata: { surveyId, recentCount },
    });
    throw new AppError("Too many submissions. Please try again later.", 429);
  }

  const autoApprove = config().AUTO_APPROVE_RESPONSES;
  const status = autoApprove ? "APPROVED" : "PENDING";

  const response = await SurveyResponse.create({
    surveyId,
    userId: user._id,
    answers,
    status,
    rewardAmount: survey.payoutPerResponse,
  });

  const freshSurvey = await Survey.findById(surveyId);
  if (!freshSurvey) throw new AppError("Survey not found", 404);

  freshSurvey.responsesReceived += 1;
  if (freshSurvey.responsesReceived >= freshSurvey.responsesNeeded) {
    freshSurvey.status = "COMPLETED";
  }
  await freshSurvey.save();

  let wallet = await Wallet.findOne({ userId: user._id });
  if (!wallet) {
    wallet = await Wallet.create({ userId: user._id });
  }

  if (autoApprove) {
    wallet.availableBalance += survey.payoutPerResponse;
    wallet.lifetimeEarnings += survey.payoutPerResponse;
    await Transaction.create({
      userId: user._id,
      type: "EARNING",
      amount: survey.payoutPerResponse,
      reference: `EARN-${uuidv4()}`,
      status: "COMPLETED",
      description: `Earning from survey: ${survey.title}`,
      metadata: { surveyId, responseId: response._id },
    });
  } else {
    wallet.pendingBalance += survey.payoutPerResponse;
    await Transaction.create({
      userId: user._id,
      type: "EARNING",
      amount: survey.payoutPerResponse,
      reference: `EARN-${uuidv4()}`,
      status: "PENDING",
      description: `Pending earning from survey: ${survey.title}`,
      metadata: { surveyId, responseId: response._id },
    });
  }
  await wallet.save();

  return { response, rewardAmount: survey.payoutPerResponse, status };
};

export const getSurveyResponses = async (researcherId: string, surveyId: string) => {
  const survey = await Survey.findOne({ _id: surveyId, researcherId });
  if (!survey) throw new AppError("Survey not found", 404);

  const responses = await SurveyResponse.find({ surveyId })
    .populate("userId", "name email ninVerified livenessVerified")
    .sort({ createdAt: -1 });

  const completionPercent =
    survey.responsesNeeded > 0
      ? Math.round((survey.responsesReceived / survey.responsesNeeded) * 100)
      : 0;

  return { survey, responses, completionPercent };
};

export const getResponseById = async (responseId: string, researcherId?: string) => {
  const response = await SurveyResponse.findById(responseId).populate(
    "userId",
    "name email ninVerified livenessVerified"
  );
  if (!response) throw new AppError("Response not found", 404);

  if (researcherId) {
    const survey = await Survey.findOne({ _id: response.surveyId, researcherId });
    if (!survey) throw new AppError("Forbidden", 403);
  }

  return response;
};

export const updateResponseStatus = async (
  researcherId: string,
  responseId: string,
  status: "APPROVED" | "REJECTED"
) => {
  const response = await SurveyResponse.findById(responseId);
  if (!response) throw new AppError("Response not found", 404);

  const survey = await Survey.findOne({ _id: response.surveyId, researcherId });
  if (!survey) throw new AppError("Forbidden", 403);

  if (response.status === status) return response;

  const wallet = await Wallet.findOne({ userId: response.userId });
  if (!wallet) throw new AppError("Wallet not found", 404);

  if (status === "APPROVED" && response.status === "PENDING") {
    wallet.pendingBalance = Math.max(0, wallet.pendingBalance - response.rewardAmount);
    wallet.availableBalance += response.rewardAmount;
    wallet.lifetimeEarnings += response.rewardAmount;
    await Transaction.create({
      userId: response.userId,
      type: "EARNING",
      amount: response.rewardAmount,
      reference: `EARN-APP-${uuidv4()}`,
      status: "COMPLETED",
      description: `Approved earning from survey: ${survey.title}`,
      metadata: { surveyId: survey._id, responseId },
    });
  } else if (status === "REJECTED" && response.status === "PENDING") {
    wallet.pendingBalance = Math.max(0, wallet.pendingBalance - response.rewardAmount);
  }

  response.status = status;
  await Promise.all([response.save(), wallet.save()]);
  return response;
};
