import config from "../config";

export const calculateSurveyCost = (
  responsesNeeded: number,
  payoutPerResponse: number
) => {
  const budget = responsesNeeded * payoutPerResponse;
  const platformFee = budget * (config().PLATFORM_FEE_PERCENT / 100);
  const totalCost = budget + platformFee;
  return { budget, platformFee, totalCost };
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
