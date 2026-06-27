import { ResponseFlag } from "../responseFlag.model";
import { countDistinctResearcherFlags } from "../suspension.service";

jest.mock("../responseFlag.model", () => ({
  ResponseFlag: {
    distinct: jest.fn(),
  },
}));

describe("countDistinctResearcherFlags", () => {
  it("returns the number of distinct researchers who flagged a user", async () => {
    (ResponseFlag.distinct as jest.Mock).mockResolvedValue(["r1", "r2"]);
    await expect(countDistinctResearcherFlags("user-1")).resolves.toBe(2);
    expect(ResponseFlag.distinct).toHaveBeenCalledWith("researcherId", { userId: "user-1" });
  });

  it("returns zero when no flags exist", async () => {
    (ResponseFlag.distinct as jest.Mock).mockResolvedValue([]);
    await expect(countDistinctResearcherFlags("user-2")).resolves.toBe(0);
  });
});
