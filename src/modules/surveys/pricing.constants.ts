import type { QuestionType } from "./survey.model";
import config from "../../config";

/** Time cost per question type in seconds */
export const TIME_WEIGHTS: Record<QuestionType, number> = {
  boolean: 2,
  single_choice: 4,
  multiple_choice: 6,
  rating: 3,
  number: 6,
  text_short: 15,
  text_long: 45,
  text: 15, // legacy
};

/** Reward rates per minute (NGN  same unit as payoutPerResponse / totalCost) */
export const STANDARD_RATE_PER_MINUTE = 60; // ₦60/min
export const PREMIUM_RATE_PER_MINUTE = 120; // ₦120/min

/** Minimum rewards (NGN) */
export const MIN_STANDARD_REWARD = 100; // ₦100
export const MIN_PREMIUM_REWARD = 200; // ₦200

export const MAX_MULTIPLE_CHOICE_OPTIONS = 10;

/** Default option count estimate when options array is empty */
export const MULTIPLE_CHOICE_DEFAULT_OPTIONS = 3;

/** Platform fee bounds (percent) */
export const PLATFORM_FEE_MIN = 20;
export const PLATFORM_FEE_MAX = 30;

/** AI add-on prices from config (NGN) */
export const getAiAddonPrices = () => {
  const cfg = config();
  return {
    spamFilterPerResponse: cfg.AI_SPAM_FILTER_COST_PER_RESPONSE,
    analyticsFlat: cfg.AI_ANALYTICS_COST,
  };
};

export const calculateAiAddOnsCost = (
  responsesNeeded: number,
  aiSpamFilterEnabled: boolean,
  aiAnalyticsEnabled: boolean
) => {
  const prices = getAiAddonPrices();
  const spamCost = aiSpamFilterEnabled ? prices.spamFilterPerResponse * responsesNeeded : 0;
  const analyticsCost = aiAnalyticsEnabled ? prices.analyticsFlat : 0;
  return {
    aiSpamFilterCost: spamCost,
    aiAnalyticsCost: analyticsCost,
    aiAddOnsCost: spamCost + analyticsCost,
  };
};
