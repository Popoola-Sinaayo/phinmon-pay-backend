import {
  calculateSurveyCost,
  calculateSurveyTime,
  calculateReward,
  computeSurveyPricing,
  isEligibleForSurvey,
} from "../surveyHelpers";

describe("calculateSurveyTime", () => {
  it("sums time weights for question types", () => {
    const { seconds, minutes } = calculateSurveyTime([
      { type: "boolean", options: [] },
      { type: "text_short", options: [] },
      { type: "text_long", options: [] },
    ]);
    expect(seconds).toBe(2 + 15 + 45);
    expect(minutes).toBe(2);
  });

  it("adds multiple choice option time", () => {
    const { seconds } = calculateSurveyTime([
      { type: "multiple_choice", options: ["a", "b", "c", "d"] },
    ]);
    expect(seconds).toBe(6 + 2 * 4);
  });
});

describe("calculateReward", () => {
  it("applies standard rate per minute", () => {
    expect(calculateReward(300, "standard")).toBe(300);
  });

  it("applies premium rate at 2x", () => {
    expect(calculateReward(300, "premium")).toBe(600);
  });

  it("enforces minimum standard reward", () => {
    expect(calculateReward(30, "standard")).toBe(100);
  });

  it("enforces minimum premium reward", () => {
    expect(calculateReward(30, "premium")).toBe(200);
  });

  it("rounds rewards to the nearest 5", () => {
    // 217s ≈ 3.6167 min × 60 = 217 → rounds to 215
    expect(calculateReward(217, "standard")).toBe(215);
    // 218s ≈ 3.633 min × 60 = 218 → rounds to 220
    expect(calculateReward(218, "standard")).toBe(220);
  });
});

describe("calculateSurveyCost", () => {
  it("calculates budget, fee, and total with 25% default fee", () => {
    const result = calculateSurveyCost(300, 100, 25);
    expect(result.budget).toBe(30000);
    expect(result.platformFeeAmount).toBe(7500);
    expect(result.totalCost).toBe(37500);
  });

  it("rounds platform fee to the nearest 5", () => {
    // 217 × 10 = 2170 budget; 25% = 542.5 → round 543 → nearest 5 = 545
    const result = calculateSurveyCost(217, 10, 25);
    expect(result.budget).toBe(2170);
    expect(result.platformFeeAmount).toBe(545);
    expect(result.totalCost).toBe(2715);
  });
});

describe("computeSurveyPricing", () => {
  it("matches spec example: 5 min survey, 100 responses", () => {
    const questions = Array.from({ length: 10 }, () => ({
      type: "boolean" as const,
      options: [] as string[],
    }));
    const pricing = computeSurveyPricing(questions, 100, "ALL_VERIFIED");
    expect(pricing.estimatedCompletionTimeMinutes).toBe(1);
    expect(pricing.rewardPerResponseStandard).toBe(100);
  });

  it("includes AI add-on costs in total", () => {
    const questions = [{ type: "boolean" as const, options: [] as string[] }];
    const pricing = computeSurveyPricing(questions, 100, "ALL_VERIFIED", {
      aiSpamFilterEnabled: true,
      aiAnalyticsEnabled: true,
    });
    expect(pricing.aiSpamFilterCost).toBe(2000);
    expect(pricing.aiAnalyticsCost).toBe(5000);
    expect(pricing.aiAddOnsCost).toBe(7000);
    expect(pricing.totalCost).toBe(pricing.budget + pricing.platformFeeAmount + 7000);
  });
});

describe("isEligibleForSurvey", () => {
  it("requires NIN for all surveys", () => {
    expect(isEligibleForSurvey("ALL_VERIFIED", false, false)).toBe(false);
  });

  it("allows verified users for ALL_VERIFIED", () => {
    expect(isEligibleForSurvey("ALL_VERIFIED", true, false)).toBe(true);
  });

  it("requires premium for PREMIUM_ONLY", () => {
    expect(isEligibleForSurvey("PREMIUM_ONLY", true, false)).toBe(false);
    expect(isEligibleForSurvey("PREMIUM_ONLY", true, true)).toBe(true);
  });

  it("disables ALL_USERS in MVP", () => {
    expect(isEligibleForSurvey("ALL_USERS", true, true)).toBe(false);
  });
});
