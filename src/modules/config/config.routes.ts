import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { calculateReward, getPlatformFeeRate } from "../../utils/surveyHelpers";
import {
  MIN_PREMIUM_REWARD,
  MIN_STANDARD_REWARD,
  PREMIUM_RATE_PER_MINUTE,
  STANDARD_RATE_PER_MINUTE,
  TIME_WEIGHTS,
} from "../surveys/pricing.constants";

const router = Router();

/** Public pricing config used to render marketing pricing without auth. */
router.get(
  "/pricing",
  asyncHandler(async (_req, res) => {
    const platformFeeRate = getPlatformFeeRate();
    const lowestQuestionSeconds = Math.min(...Object.values(TIME_WEIGHTS));
    const lowestRewardStandard = calculateReward(lowestQuestionSeconds, "standard");
    const lowestRewardPremium = calculateReward(lowestQuestionSeconds, "premium");

    res.json({
      success: true,
      platformFeeRate,
      standardRatePerMinute: STANDARD_RATE_PER_MINUTE,
      premiumRatePerMinute: PREMIUM_RATE_PER_MINUTE,
      minStandardReward: MIN_STANDARD_REWARD,
      minPremiumReward: MIN_PREMIUM_REWARD,
      lowestRewardStandard,
      lowestRewardPremium,
    });
  })
);

export default router;
