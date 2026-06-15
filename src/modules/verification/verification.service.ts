import { User } from "../users/user.model";
import { getNINProvider } from "../../providers/nin";
import { getLivenessProvider } from "../../providers/liveness";
import { encryptNIN } from "../../utils/encryption";
import { logAudit } from "../admin/auditLog.model";
import { AppError } from "../../utils/errors";
import config from "../../config";

export const verifyNIN = async (userId: string, nin: string, ip?: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (user.ninVerified) throw new AppError("NIN already verified", 400);

  const provider = getNINProvider();
  const result = await provider.verifyNIN({ nin, userId });

  await logAudit({
    userId: user._id,
    action: "NIN_VERIFICATION_ATTEMPT",
    resource: "user",
    resourceId: userId,
    metadata: { success: result.success },
    ip,
  });

  if (!result.success) {
    throw new AppError(result.message || "NIN verification failed", 400);
  }

  user.ninVerified = true;
  user.status = user.livenessVerified ? "PREMIUM" : "VERIFIED";
  user.encryptedNin = encryptNIN(nin);
  await user.save();

  return {
    ninVerified: true,
    status: user.status,
    message: "NIN verified successfully",
  };
};

export const getVerificationStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  return {
    ninVerified: user.ninVerified,
    livenessVerified: user.livenessVerified,
    status: user.status,
    livenessEnabled: config().FEATURE_LIVENESS,
  };
};

export const startLiveness = async (userId: string) => {
  if (!config().FEATURE_LIVENESS) {
    throw new AppError("Liveness verification is not enabled", 403);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (!user.ninVerified) throw new AppError("Complete NIN verification first", 403);
  if (user.livenessVerified) throw new AppError("Already premium verified", 400);

  const provider = getLivenessProvider();
  return provider.startVerification(userId);
};

export const completeLiveness = async (userId: string, sessionId: string) => {
  if (!config().FEATURE_LIVENESS) {
    throw new AppError("Liveness verification is not enabled", 403);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  const provider = getLivenessProvider();
  const result = await provider.completeVerification({ userId, sessionId });

  if (!result.success) {
    throw new AppError(result.message || "Liveness verification failed", 400);
  }

  user.livenessVerified = true;
  user.status = "PREMIUM";
  await user.save();

  return {
    livenessVerified: true,
    status: user.status,
    message: "Premium verification complete",
  };
};
