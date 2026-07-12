import { Types } from "mongoose";
import { Survey, ISurvey } from "../surveys/survey.model";
import { SurveyResponse } from "./response.model";
import { SurveyReservation } from "./reservation.model";
import { isEligibleForSurvey } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import { IUser } from "../users/user.model";
import { createLogger } from "../../utils/logger";

const log = createLogger("Reservations");

const MIN_RESERVATION_MINUTES = 15;
const MAX_RESERVATION_MINUTES = 90;

/**
 * How long a respondent may hold a slot before it is auto-released. Derived from
 * the survey's estimated completion time with generous headroom, clamped to a
 * sane range.
 */
export const getReservationTtlMs = (
  survey: Pick<ISurvey, "estimatedCompletionTimeMinutes" | "estimatedMinutes">
): number => {
  const est = survey.estimatedCompletionTimeMinutes || survey.estimatedMinutes || 1;
  const minutes = Math.min(
    MAX_RESERVATION_MINUTES,
    Math.max(MIN_RESERVATION_MINUTES, Math.ceil(est * 3))
  );
  return minutes * 60 * 1000;
};

const buildReservationResult = async (surveyId: string, expiresAt: Date) => {
  const survey = await Survey.findById(surveyId)
    .select("responsesNeeded responsesReceived reservedSlots")
    .lean();
  const remainingSlots = survey
    ? Math.max(0, survey.responsesNeeded - survey.responsesReceived - survey.reservedSlots)
    : 0;
  return {
    reserved: true,
    expiresAt,
    ttlSeconds: Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 1000)),
    remainingSlots,
  };
};

/**
 * Deletes expired reservations and releases the slots they held. We do this in
 * application code (rather than a Mongo TTL index) so the survey's reservedSlots
 * counter is decremented in lockstep with each deletion.
 */
export const sweepExpiredReservations = async (surveyId?: string): Promise<number> => {
  const query: Record<string, unknown> = { expiresAt: { $lte: new Date() } };
  if (surveyId) query.surveyId = new Types.ObjectId(surveyId);

  const expired = await SurveyReservation.find(query).select("_id surveyId").lean();
  let released = 0;

  for (const reservation of expired) {
    const del = await SurveyReservation.deleteOne({ _id: reservation._id });
    if (del.deletedCount === 1) {
      await Survey.updateOne(
        { _id: reservation.surveyId, reservedSlots: { $gt: 0 } },
        { $inc: { reservedSlots: -1 } }
      );
      released += 1;
    }
  }

  if (released > 0) log.info("Swept expired reservations", { released, surveyId });
  return released;
};

/**
 * Reserves a response slot for the user before they begin the task. Uses an
 * atomic conditional update so concurrent starts can never claim more than the
 * remaining capacity (responsesNeeded - responsesReceived - reservedSlots).
 */
export const startSurvey = async (user: IUser, surveyId: string) => {
  if (user.status === "SUSPENDED") {
    throw new AppError("Your account has been suspended", 403, { code: "ACCOUNT_SUSPENDED" });
  }
  if (!user.ninVerified) throw new AppError("NIN verification required", 403);

  const survey = await Survey.findById(surveyId);
  if (!survey) throw new AppError("Task not found", 404);
  if (survey.status !== "ACTIVE") {
    throw new AppError("This task is not currently active", 400, { code: "NOT_ACTIVE" });
  }
  if (survey.billingLocked) {
    throw new AppError("This task is temporarily unavailable", 400, { code: "UNAVAILABLE" });
  }
  if (!isEligibleForSurvey(survey.targetAudience, user.ninVerified, user.livenessVerified)) {
    throw new AppError("You are not eligible for this task", 403, { code: "NOT_ELIGIBLE" });
  }

  const alreadySubmitted = await SurveyResponse.findOne({ surveyId, userId: user._id })
    .select("_id")
    .lean();
  if (alreadySubmitted) {
    throw new AppError("You have already completed this task", 409, { code: "ALREADY_SUBMITTED" });
  }

  const ttlMs = getReservationTtlMs(survey);

  // Free up any slots held by abandoned/expired sessions before we try to claim.
  await sweepExpiredReservations(surveyId);

  // If the user still holds a live reservation, simply renew it (no new claim).
  const existing = await SurveyReservation.findOne({ surveyId, userId: user._id });
  if (existing) {
    existing.expiresAt = new Date(Date.now() + ttlMs);
    await existing.save();
    return buildReservationResult(surveyId, existing.expiresAt);
  }

  // Atomically claim a slot only if capacity remains.
  const claimed = await Survey.findOneAndUpdate(
    {
      _id: surveyId,
      status: "ACTIVE",
      billingLocked: { $ne: true },
      $expr: {
        $lt: [{ $add: ["$responsesReceived", "$reservedSlots"] }, "$responsesNeeded"],
      },
    },
    { $inc: { reservedSlots: 1 } },
    { new: true }
  );

  if (!claimed) {
    throw new AppError("This task is full. All response slots have been taken.", 409, {
      code: "FULL",
    });
  }

  const expiresAt = new Date(Date.now() + ttlMs);
  try {
    await SurveyReservation.create({ surveyId, userId: user._id, expiresAt });
  } catch (err) {
    // A concurrent request created the reservation first; give back our extra slot.
    await Survey.updateOne(
      { _id: surveyId, reservedSlots: { $gt: 0 } },
      { $inc: { reservedSlots: -1 } }
    );
    if ((err as { code?: number }).code === 11000) {
      const current = await SurveyReservation.findOne({ surveyId, userId: user._id });
      if (current) return buildReservationResult(surveyId, current.expiresAt);
    }
    throw err;
  }

  return buildReservationResult(surveyId, expiresAt);
};

/**
 * Best-effort release of a held slot (e.g. when the user abandons the task).
 */
export const releaseReservation = async (userId: string, surveyId: string) => {
  const del = await SurveyReservation.deleteOne({ surveyId, userId });
  if (del.deletedCount === 1) {
    await Survey.updateOne(
      { _id: surveyId, reservedSlots: { $gt: 0 } },
      { $inc: { reservedSlots: -1 } }
    );
    return { released: true };
  }
  return { released: false };
};
