import { ResponseFlag } from "./responseFlag.model";
import { User } from "../users/user.model";
import { FraudFlag } from "../admin/fraudFlag.model";
import { logAudit } from "../admin/auditLog.model";

const SUSPENSION_THRESHOLD = 2;

export const countDistinctResearcherFlags = async (userId: string): Promise<number> => {
  const researchers = await ResponseFlag.distinct("researcherId", { userId });
  return researchers.length;
};

export const maybeSuspendUser = async (
  userId: string,
  reason: string
): Promise<boolean> => {
  const flagCount = await countDistinctResearcherFlags(userId);
  if (flagCount < SUSPENSION_THRESHOLD) return false;

  const user = await User.findById(userId);
  if (!user || user.status === "SUSPENDED") return false;

  user.status = "SUSPENDED";
  user.suspendedAt = new Date();
  user.suspensionReason = reason;
  await user.save();

  await FraudFlag.create({
    userId: user._id,
    reason: `Account suspended after ${flagCount} researcher flags`,
    severity: "high",
    metadata: { flagCount },
  });

  await logAudit({
    userId: user._id,
    action: "USER_SUSPENDED",
    resource: "user",
    resourceId: user._id.toString(),
    metadata: { flagCount, reason },
  });

  return true;
};
