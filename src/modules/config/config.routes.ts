import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import config from "../../config";
import { isPremiumAudienceEnabled, isLivenessEnabled } from "../../providers/liveness";
import { calculateReward, getPlatformFeeRate } from "../../utils/surveyHelpers";
import {
  MIN_PREMIUM_REWARD,
  MIN_STANDARD_REWARD,
  PREMIUM_RATE_PER_MINUTE,
  STANDARD_RATE_PER_MINUTE,
  TIME_WEIGHTS,
  getAiAddonPrices,
} from "../surveys/pricing.constants";

const router = Router();

/** Public platform feature flags for UI gating. */
router.get(
  "/features",
  asyncHandler(async (_req, res) => {
    const premiumLivenessEnabled = isLivenessEnabled();
    res.json({
      success: true,
      premiumLivenessEnabled,
      premiumAudienceEnabled: isPremiumAudienceEnabled(),
      premiumLivenessComingSoon: !premiumLivenessEnabled,
    });
  })
);

/** Public pricing config used to render marketing pricing without auth. */
router.get(
  "/pricing",
  asyncHandler(async (_req, res) => {
    const platformFeeRate = getPlatformFeeRate();
    const lowestQuestionSeconds = Math.min(...Object.values(TIME_WEIGHTS));
    const lowestRewardStandard = calculateReward(lowestQuestionSeconds, "standard");
    const lowestRewardPremium = calculateReward(lowestQuestionSeconds, "premium");
    const addOns = getAiAddonPrices();
    const cfg = config();

    res.json({
      success: true,
      platformFeeRate,
      standardRatePerMinute: STANDARD_RATE_PER_MINUTE,
      premiumRatePerMinute: PREMIUM_RATE_PER_MINUTE,
      minStandardReward: MIN_STANDARD_REWARD,
      minPremiumReward: MIN_PREMIUM_REWARD,
      lowestRewardStandard,
      lowestRewardPremium,
      aiAnalyticsCost: addOns.analyticsFlat,
      aiSpamFilterCostPerResponse: addOns.spamFilterPerResponse,
      aiAnalyticsEnabled: cfg.FEATURE_AI_ANALYTICS,
      aiSpamFilterEnabled: cfg.FEATURE_AI_SPAM_FILTER,
      timeWeights: TIME_WEIGHTS,
      questionTypeLabels: {
        boolean: "Yes / No",
        single_choice: "Single choice",
        multiple_choice: "Multiple choice",
        rating: "Rating scale",
        number: "Number input",
        text_short: "Short text",
        text_long: "Long text",
        text: "Short text",
      },
      multipleChoiceTimeFormula: "6s base + 2s per option",
    });
  })
);

export default router;
