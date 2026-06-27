import { isHeuristicSpam } from "../spam.service";

describe("isHeuristicSpam", () => {
  it("flags repeated characters", () => {
    expect(isHeuristicSpam("yyy")).toBe(true);
    expect(isHeuristicSpam("zzz")).toBe(true);
  });

  it("flags very short answers", () => {
    expect(isHeuristicSpam("ab")).toBe(true);
  });

  it("flags common spam tokens", () => {
    expect(isHeuristicSpam("asdf")).toBe(true);
    expect(isHeuristicSpam("test")).toBe(true);
  });

  it("allows meaningful answers", () => {
    expect(isHeuristicSpam("I prefer online banking because it is convenient.")).toBe(false);
  });
});
