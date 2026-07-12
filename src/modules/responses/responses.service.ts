import { v4 as uuidv4 } from "uuid";
import { Survey } from "../surveys/survey.model";
import { SurveyResponse } from "./response.model";
import { SurveyReservation } from "./reservation.model";
import { ResponseFlag } from "./responseFlag.model";
import { Wallet } from "../wallets/wallet.model";
import { Transaction } from "../wallets/transaction.model";
import { FraudFlag } from "../admin/fraudFlag.model";
import { isEligibleForSurvey } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";
import { IUser } from "../users/user.model";
import { detectSpamAnswers } from "./spam.service";
import { maybeSuspendUser } from "./suspension.service";
import { releaseReservation } from "./reservation.service";
import { createLogger } from "../../utils/logger";

const log = createLogger("Responses");

const RAPID_SUBMIT_WINDOW_MS = 60 * 1000;
const RAPID_SUBMIT_THRESHOLD = 3;

const isDuplicateKeyError = (err: unknown): boolean =>
  !!err && typeof err === "object" && (err as { code?: number }).code === 11000;

/**
 * Atomically claims one response slot. Returns true only if capacity remained
 * (responsesReceived < responsesNeeded) at the moment of the update. This is the
 * authoritative guard that prevents paying out more than the funded budget under
 * concurrent submissions. If the user held a reservation, its slot is converted
 * (reservedSlots decremented) in the same atomic step.
 */
const claimResponseSlot = async (surveyId: string, hadReservation: boolean) => {
  const decReserved = hadReservation ? 1 : 0;
  return Survey.findOneAndUpdate(
    {
      _id: surveyId,
      status: "ACTIVE",
      billingLocked: { $ne: true },
      $expr: { $lt: ["$responsesReceived", "$responsesNeeded"] },
    },
    [
      {
        $set: {
          responsesReceived: { $add: ["$responsesReceived", 1] },
          reservedSlots: {
            $max: [{ $subtract: ["$reservedSlots", decReserved] }, 0],
          },
        },
      },
      {
        $set: {
          status: {
            $cond: [
              { $gte: ["$responsesReceived", "$responsesNeeded"] },
              "COMPLETED",
              "$status",
            ],
          },
        },
      },
    ],
    { new: true }
  );
};

/** Reverts a slot claim if the response could not be persisted afterwards. */
const revertResponseSlot = async (surveyId: string) => {
  await Survey.updateOne({ _id: surveyId }, [
    {
      $set: {
        responsesReceived: { $max: [{ $subtract: ["$responsesReceived", 1] }, 0] },
      },
    },
    {
      $set: {
        status: {
          $cond: [
            {
              $and: [
                { $eq: ["$status", "COMPLETED"] },
                { $lt: ["$responsesReceived", "$responsesNeeded"] },
              ],
            },
            "ACTIVE",
            "$status",
          ],
        },
      },
    },
  ]);
};

const clawbackReward = async (
  userId: string,
  rewardAmount: number,
  previousStatus: string,
  surveyTitle: string,
  surveyId: string,
  responseId: string
) => {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) return;

  if (previousStatus === "APPROVED") {
    wallet.availableBalance = Math.max(0, wallet.availableBalance - rewardAmount);
    wallet.lifetimeEarnings = Math.max(0, wallet.lifetimeEarnings - rewardAmount);
    await Transaction.create({
      userId,
      type: "ADJUSTMENT",
      amount: -rewardAmount,
      reference: `CLAW-${uuidv4()}`,
      status: "COMPLETED",
      description: `Clawback for flagged response: ${surveyTitle}`,
      metadata: { surveyId, responseId },
    });
  } else if (previousStatus === "PENDING") {
    wallet.pendingBalance = Math.max(0, wallet.pendingBalance - rewardAmount);
  }

  await wallet.save();
};

export const submitResponse = async (
  user: IUser,
  surveyId: string,
  answers: Array<{ questionId: string; type: string; value: unknown }>
) => {
  if (user.status === "SUSPENDED") {
    throw new AppError("Your account has been suspended", 403, { code: "ACCOUNT_SUSPENDED" });
  }
  if (!user.ninVerified) throw new AppError("NIN verification required", 403);

  const survey = await Survey.findById(surveyId);
  if (!survey) throw new AppError("Task not found", 404);
  if (survey.status !== "ACTIVE") throw new AppError("This task is not active", 400);
  if (survey.billingLocked) throw new AppError("This task is temporarily unavailable", 400);
  // Non-authoritative early check for a friendly error; the atomic claim below is
  // what actually protects capacity under concurrency.
  if (survey.responsesReceived >= survey.responsesNeeded) {
    throw new AppError("This task has reached its response limit", 409, { code: "FULL" });
  }

  if (!isEligibleForSurvey(survey.targetAudience, user.ninVerified, user.livenessVerified)) {
    throw new AppError("You are not eligible for this task", 403);
  }

  const existing = await SurveyResponse.findOne({ surveyId, userId: user._id });
  if (existing) throw new AppError("You have already completed this task", 409);

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

  let spamSuspected = false;
  let forcePending = false;

  if (survey.aiSpamFilterEnabled && config().FEATURE_AI_SPAM_FILTER) {
    try {
      const spam = await detectSpamAnswers(survey.questions, answers);
      if (spam.isSpam) {
        spamSuspected = true;
        forcePending = true;
      }
    } catch {
      // Fail open
    }
  }

  const autoApprove = config().AUTO_APPROVE_RESPONSES && !forcePending;
  const status = autoApprove ? "APPROVED" : "PENDING";

  // Convert the user's reservation (if any) into a received response atomically.
  const hadReservation = !!(await SurveyReservation.findOne({
    surveyId,
    userId: user._id,
  })
    .select("_id")
    .lean());

  const claimed = await claimResponseSlot(surveyId, hadReservation);
  if (!claimed) {
    // Task filled up between reservation and submit (or was closed). Give back
    // the held slot so it can be reused, and report cleanly.
    await releaseReservation(user._id.toString(), surveyId).catch(() => {});
    throw new AppError("This task just reached its response limit before your submission.", 409, {
      code: "FULL",
    });
  }

  let response;
  try {
    response = await SurveyResponse.create({
      surveyId,
      userId: user._id,
      answers,
      status,
      rewardAmount: survey.payoutPerResponse,
      spamSuspected,
    });
  } catch (err) {
    // Persisting the response failed; return the slot we just claimed.
    await revertResponseSlot(surveyId);
    if (isDuplicateKeyError(err)) {
      throw new AppError("You have already completed this task", 409);
    }
    throw err;
  }

  // Slot secured and response stored: remove the now-consumed reservation doc.
  // The counter was already decremented inside claimResponseSlot, so we only
  // delete the document here (no further counter change).
  await SurveyReservation.deleteOne({ surveyId, userId: user._id }).catch(() => {});

  if (spamSuspected) {
    await FraudFlag.create({
      userId: user._id,
      reason: "Possible spam response (AI)",
      severity: "medium",
      metadata: { surveyId, responseId: response._id },
    });
  }

  try {
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
  } catch (err) {
    // The slot and response are committed but crediting failed. Do NOT roll back
    // the response (the researcher legitimately received it); log for
    // reconciliation instead of risking a double payout.
    log.error("Wallet credit failed after response committed  needs reconciliation", {
      userId: user._id.toString(),
      surveyId,
      responseId: response._id.toString(),
      amount: survey.payoutPerResponse,
      message: (err as Error).message,
    });
  }

  return { response, rewardAmount: survey.payoutPerResponse, status, spamSuspected };
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
  if (response.status === "FLAGGED") {
    throw new AppError("Response has been flagged and cannot be updated", 400);
  }

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

export const flagResponseInvalid = async (
  researcherId: string,
  responseId: string,
  reason?: string
) => {
  const response = await SurveyResponse.findById(responseId);
  if (!response) throw new AppError("Response not found", 404);

  const survey = await Survey.findOne({ _id: response.surveyId, researcherId });
  if (!survey) throw new AppError("Forbidden", 403);

  if (response.status === "FLAGGED") {
    return { response, suspended: false };
  }

  const previousStatus = response.status;

  await ResponseFlag.findOneAndUpdate(
    { responseId: response._id, researcherId },
    {
      responseId: response._id,
      surveyId: survey._id,
      researcherId,
      userId: response.userId,
      reason,
    },
    { upsert: true, new: true }
  );

  await clawbackReward(
    response.userId.toString(),
    response.rewardAmount,
    previousStatus,
    survey.title,
    survey._id.toString(),
    response._id.toString()
  );

  response.status = "FLAGGED";
  response.flagReason = reason || "Flagged as invalid by researcher";
  await response.save();

  const suspended = await maybeSuspendUser(
    response.userId.toString(),
    "Multiple researchers flagged responses as invalid"
  );

  return { response, suspended };
};
