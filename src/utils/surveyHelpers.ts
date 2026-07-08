import config from "../config";
import type { IQuestion, QuestionType, SurveyAudience } from "../modules/surveys/survey.model";
import {
  MAX_MULTIPLE_CHOICE_OPTIONS,
  MIN_PREMIUM_REWARD,
  MIN_STANDARD_REWARD,
  MULTIPLE_CHOICE_DEFAULT_OPTIONS,
  PLATFORM_FEE_MAX,
  PLATFORM_FEE_MIN,
  PREMIUM_RATE_PER_MINUTE,
  STANDARD_RATE_PER_MINUTE,
  TIME_WEIGHTS,
  calculateAiAddOnsCost,
} from "../modules/surveys/pricing.constants";

export type RewardTier = "standard" | "premium";

export interface SurveyTimeResult {
  seconds: number;
  minutes: number;
}

export interface SurveyCostResult {
  budget: number;
  platformFeeAmount: number;
  totalCost: number;
  platformFeeRate: number;
}

export interface SurveyPricingResult extends SurveyTimeResult, SurveyCostResult {
  rewardPerResponseStandard: number;
  rewardPerResponsePremium: number;
  payoutPerResponse: number;
  estimatedCompletionTimeSeconds: number;
  estimatedCompletionTimeMinutes: number;
  estimatedMinutes: number;
  highComplexity: boolean;
  platformFee: number;
  aiSpamFilterEnabled: boolean;
  aiAnalyticsEnabled: boolean;
  aiSpamFilterCost: number;
  aiAnalyticsCost: number;
  aiAddOnsCost: number;
}

/** Normalize legacy `text` to `text_short` */
export const normalizeQuestionType = (type: string): QuestionType => {
  if (type === "text") return "text_short";
  return type as QuestionType;
};

export const questionTimeSeconds = (question: Pick<IQuestion, "type" | "options">): number => {
  const type = normalizeQuestionType(question.type);

  if (type === "multiple_choice") {
    const optionCount = question.options?.length || MULTIPLE_CHOICE_DEFAULT_OPTIONS;
    return TIME_WEIGHTS.multiple_choice + 2 * optionCount;
  }

  return TIME_WEIGHTS[type] ?? TIME_WEIGHTS.text_short;
};

export const detectHighComplexity = (questions: Pick<IQuestion, "type" | "options">[]): boolean =>
  questions.some(
    (q) =>
      normalizeQuestionType(q.type) === "multiple_choice" &&
      (q.options?.length ?? 0) > MAX_MULTIPLE_CHOICE_OPTIONS
  );

export const calculateSurveyTime = (
  questions: Pick<IQuestion, "type" | "options">[]
): SurveyTimeResult => {
  const seconds = questions.reduce((sum, q) => sum + questionTimeSeconds(q), 0);
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return { seconds, minutes };
};

export const calculateReward = (seconds: number, tier: RewardTier): number => {
  const cfg = config();
  const minutes = seconds / 60;
  const rate =
    tier === "premium" && cfg.FEATURE_PREMIUM_MULTIPLIER
      ? PREMIUM_RATE_PER_MINUTE
      : STANDARD_RATE_PER_MINUTE;
  const min =
    tier === "premium" && cfg.FEATURE_PREMIUM_MULTIPLIER
      ? MIN_PREMIUM_REWARD
      : MIN_STANDARD_REWARD;

  return Math.max(min, Math.round(minutes * rate));
};

export const getPlatformFeeRate = (): number => {
  const rate = config().PLATFORM_FEE_PERCENT;
  return Math.min(PLATFORM_FEE_MAX, Math.max(PLATFORM_FEE_MIN, rate));
};

export const calculateSurveyCost = (
  rewardPerResponse: number,
  responsesNeeded: number,
  platformFeeRate?: number
): SurveyCostResult => {
  const rate = platformFeeRate ?? getPlatformFeeRate();
  const budget = responsesNeeded * rewardPerResponse;
  const platformFeeAmount = Math.round(budget * (rate / 100));
  const totalCost = budget + platformFeeAmount;
  return { budget, platformFeeAmount, totalCost, platformFeeRate: rate };
};

/** @deprecated PAYG billing removed  kept for dormant billing module */
export const calculatePerResponseCost = (rewardPerResponse: number, platformFeeRate?: number) => {
  const rate = platformFeeRate ?? getPlatformFeeRate();
  const platformFeeAmount = Math.round(rewardPerResponse * (rate / 100));
  return rewardPerResponse + platformFeeAmount;
};

export const computeSurveyPricing = (
  questions: Pick<IQuestion, "type" | "options">[],
  responsesNeeded: number,
  targetAudience: SurveyAudience,
  options?: { aiSpamFilterEnabled?: boolean; aiAnalyticsEnabled?: boolean }
): SurveyPricingResult => {
  const { seconds, minutes } = calculateSurveyTime(questions);
  const rewardPerResponseStandard = calculateReward(seconds, "standard");
  const rewardPerResponsePremium = calculateReward(seconds, "premium");
  const payoutPerResponse =
    targetAudience === "PREMIUM_ONLY"
      ? rewardPerResponsePremium
      : rewardPerResponseStandard;

  const cost = calculateSurveyCost(payoutPerResponse, responsesNeeded);
  const highComplexity = detectHighComplexity(questions);
  const aiSpamFilterEnabled = options?.aiSpamFilterEnabled ?? false;
  const aiAnalyticsEnabled = options?.aiAnalyticsEnabled ?? false;
  const addOns = calculateAiAddOnsCost(responsesNeeded, aiSpamFilterEnabled, aiAnalyticsEnabled);

  return {
    seconds,
    minutes,
    estimatedCompletionTimeSeconds: seconds,
    estimatedCompletionTimeMinutes: minutes,
    estimatedMinutes: minutes,
    rewardPerResponseStandard,
    rewardPerResponsePremium,
    payoutPerResponse,
    highComplexity,
    aiSpamFilterEnabled,
    aiAnalyticsEnabled,
    aiSpamFilterCost: addOns.aiSpamFilterCost,
    aiAnalyticsCost: addOns.aiAnalyticsCost,
    aiAddOnsCost: addOns.aiAddOnsCost,
    budget: cost.budget,
    platformFeeAmount: cost.platformFeeAmount,
    platformFeeRate: cost.platformFeeRate,
    platformFee: cost.platformFeeAmount,
    totalCost: cost.totalCost + addOns.aiAddOnsCost,
  };
};

export const isEligibleForSurvey = (
  targetAudience: string,
  ninVerified: boolean,
  livenessVerified: boolean
): boolean => {
  if (targetAudience === "ALL_USERS") return false;
  if (!ninVerified) return false;
  if (targetAudience === "PREMIUM_ONLY") return livenessVerified;
  return true;
};

export const isVisibleSurvey = (targetAudience: string): boolean => {
  return targetAudience === "ALL_VERIFIED" || targetAudience === "PREMIUM_ONLY";
};

export interface QuestionTimeBreakdownItem {
  index: number;
  type: QuestionType;
  seconds: number;
  optionCount?: number;
}

export const getQuestionTimeBreakdown = (
  questions: Pick<IQuestion, "type" | "options">[]
): QuestionTimeBreakdownItem[] =>
  questions.map((q, i) => ({
    index: i + 1,
    type: normalizeQuestionType(q.type),
    seconds: questionTimeSeconds(q),
    optionCount:
      normalizeQuestionType(q.type) === "multiple_choice" ? q.options?.length : undefined,
  }));
