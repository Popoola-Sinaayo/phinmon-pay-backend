import { describe, expect, it } from "@jest/globals";
import {
  dobMatch,
  formatDateOnly,
  formatNinRetryWait,
  getNinCooldownHours,
  getNinRetryRemainingMs,
  isNinLocked,
  namesMatch,
  normalizeName,
} from "../ninMatching";

describe("ninMatching", () => {
  it("normalizes names", () => {
    expect(normalizeName("  John   Doe  ")).toBe("john doe");
  });

  it("matches registered name to NIN names", () => {
    expect(namesMatch("Chidi Okafor", "Chidi", "Okafor")).toBe(true);
    expect(namesMatch("Okafor Chidi Emmanuel", "Chidi", "Okafor")).toBe(true);
    expect(namesMatch("Jane Smith", "Chidi", "Okafor")).toBe(false);
  });

  it("matches date of birth", () => {
    expect(dobMatch("1998-05-12", "1998-05-12")).toBe(true);
    expect(dobMatch(new Date("1998-05-12"), "1998-05-12T00:00:00.000Z")).toBe(true);
    expect(dobMatch("1998-05-12", "1990-01-01")).toBe(false);
  });

  it("formats date only", () => {
    expect(formatDateOnly("1998-05-12")).toBe("1998-05-12");
  });

  it("tracks lockout window", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isNinLocked(future)).toBe(true);
    expect(getNinRetryRemainingMs(future)).toBeGreaterThan(0);
  });

  it("escalates cooldown hours after each failed attempt", () => {
    expect(getNinCooldownHours(1)).toBe(1);
    expect(getNinCooldownHours(2)).toBe(2);
    expect(getNinCooldownHours(3)).toBe(4);
    expect(getNinCooldownHours(4)).toBe(8);
    expect(getNinCooldownHours(5)).toBe(16);
    expect(getNinCooldownHours(6)).toBe(24);
    expect(getNinCooldownHours(10)).toBe(24);
    expect(getNinCooldownHours(0)).toBe(1);
  });

  it("formats remaining wait time", () => {
    expect(formatNinRetryWait(90 * 60 * 1000)).toBe("2 hours");
    expect(formatNinRetryWait(60 * 60 * 1000)).toBe("1 hour");
    expect(formatNinRetryWait(90 * 1000)).toBe("2 minutes");
  });
});
