import config from "../../config";
import { newSurveyEmailTemplate } from "../../emails/templates";
import { formatNaira } from "../../emails/layout";
import { getEmailProvider } from "../../providers/email";
import { Survey, ISurvey } from "../surveys/survey.model";
import { User } from "../users/user.model";
import { isEligibleForSurvey, isVisibleSurvey } from "../../utils/surveyHelpers";
import { createLogger } from "../../utils/logger";

const log = createLogger("SurveyNotifications");

const BATCH_SIZE = 15;

const payoutForUser = (survey: ISurvey): number => survey.payoutPerResponse;

const findEligibleRespondents = async (survey: ISurvey) => {
  const baseQuery = {
    role: "respondent" as const,
    ninVerified: true,
    status: { $ne: "SUSPENDED" as const },
  };

  const users = await User.find(
    survey.targetAudience === "PREMIUM_ONLY"
      ? { ...baseQuery, livenessVerified: true }
      : baseQuery
  ).select("email name ninVerified livenessVerified");

  return users.filter((user) =>
    isEligibleForSurvey(survey.targetAudience, user.ninVerified, user.livenessVerified)
  );
};

/** Notify all eligible respondents when a survey goes live. Runs async; errors are logged. */
export const notifyEligibleUsersOfNewSurvey = async (surveyId: string): Promise<void> => {
  const survey = await Survey.findById(surveyId);
  if (!survey) {
    log.warn("Survey not found for notification", { surveyId });
    return;
  }

  if (survey.status !== "ACTIVE") {
    log.debug("Skipping notification  survey not active", { surveyId, status: survey.status });
    return;
  }

  if (!isVisibleSurvey(survey.targetAudience)) {
    log.debug("Skipping notification  audience not visible in MVP", {
      surveyId,
      targetAudience: survey.targetAudience,
    });
    return;
  }

  const users = await findEligibleRespondents(survey);
  if (users.length === 0) {
    log.info("No eligible respondents to notify", { surveyId, title: survey.title });
    return;
  }

  const surveyUrl = `${config().FRONTEND_URL}/surveys/${survey._id}`;
  const emailProvider = getEmailProvider();
  const estimatedMinutes =
    survey.estimatedCompletionTimeMinutes || survey.estimatedMinutes || 5;
  const questionCount = survey.questions?.length || 0;
  const isPremium = survey.targetAudience === "PREMIUM_ONLY";

  log.info("Sending new survey notifications", {
    surveyId,
    title: survey.title,
    recipientCount: users.length,
    audience: survey.targetAudience,
  });

  let sent = 0;
  let failed = 0;

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (user) => {
        const payout = payoutForUser(survey);
        await emailProvider.send({
          to: user.email,
          subject: `New survey  earn ${formatNaira(payout)} · ${survey.title}`,
          html: newSurveyEmailTemplate({
            recipientName: user.name,
            surveyTitle: survey.title,
            surveyDescription: survey.description,
            surveyUrl,
            payoutAmount: payout,
            estimatedMinutes,
            questionCount,
            isPremium,
            category: survey.category,
          }),
        });
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") sent += 1;
      else {
        failed += 1;
        log.warn("Failed to send survey notification", {
          surveyId,
          error: (result.reason as Error)?.message,
        });
      }
    }
  }

  log.info("New survey notifications complete", { surveyId, sent, failed, total: users.length });
};
