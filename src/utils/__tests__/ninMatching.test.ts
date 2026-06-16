import { describe, expect, it } from "@jest/globals";
import {
  dobMatch,
  formatDateOnly,
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
});
