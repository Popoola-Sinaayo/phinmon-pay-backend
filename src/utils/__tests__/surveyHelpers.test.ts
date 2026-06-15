import { calculateSurveyCost, isEligibleForSurvey } from "../surveyHelpers";

describe("calculateSurveyCost", () => {
  it("calculates budget, fee, and total", () => {
    const result = calculateSurveyCost(100, 500);
    expect(result.budget).toBe(50000);
    expect(result.platformFee).toBe(7500);
    expect(result.totalCost).toBe(57500);
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
