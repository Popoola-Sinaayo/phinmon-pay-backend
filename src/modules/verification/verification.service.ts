import { User } from "../users/user.model";
import { Profile } from "../users/profile.model";
import { getNINProvider } from "../../providers/nin";
import { getLivenessProvider } from "../../providers/liveness";
import { encryptNIN } from "../../utils/encryption";
import { logAudit } from "../admin/auditLog.model";
import { AppError } from "../../utils/errors";
import {
  dobMatch,
  formatDateOnly,
  getNinRetryRemainingMs,
  isNinLocked,
  namesMatch,
  NIN_RETRY_COOLDOWN_HOURS,
} from "../../utils/ninMatching";
import config from "../../config";

const getNinStatusPayload = (user: InstanceType<typeof User>) => {
  const locked = isNinLocked(user.ninLockedUntil);
  const retryRemainingMs = getNinRetryRemainingMs(user.ninLockedUntil);

  return {
    ninVerified: user.ninVerified,
    livenessVerified: user.livenessVerified,
    status: user.status,
    livenessEnabled: config().FEATURE_LIVENESS,
    ninLocked: locked,
    ninLockedUntil: user.ninLockedUntil?.toISOString() || null,
    retryRemainingMs,
    retryRemainingHours: Math.ceil(retryRemainingMs / (60 * 60 * 1000)),
    ninMismatchCount: user.ninMismatchCount || 0,
    cooldownHours: NIN_RETRY_COOLDOWN_HOURS,
  };
};

export const verifyNIN = async (userId: string, nin: string, ip?: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (user.ninVerified) throw new AppError("NIN already verified", 400);

  if (isNinLocked(user.ninLockedUntil)) {
    const hoursLeft = Math.ceil(getNinRetryRemainingMs(user.ninLockedUntil) / (60 * 60 * 1000));
    throw new AppError(
      `NIN verification locked. Try again in ${hoursLeft} hour${hoursLeft === 1 ? "" : "s"}.`,
      429,
      {
        ninLocked: true,
        ninLockedUntil: user.ninLockedUntil?.toISOString(),
        retryRemainingMs: getNinRetryRemainingMs(user.ninLockedUntil),
      }
    );
  }

  const profile = await Profile.findOne({ userId });
  if (!user.name?.trim()) {
    throw new AppError("Complete your profile with your legal name before NIN verification", 400);
  }
  if (!profile?.dateOfBirth) {
    throw new AppError("Add your date of birth in onboarding before NIN verification", 400);
  }

  const provider = getNINProvider();
  const result = await provider.verifyNIN({
    nin,
    userId,
    registeredName: user.name,
    registeredDob: formatDateOnly(profile.dateOfBirth),
  });

  await logAudit({
    userId: user._id,
    action: "NIN_VERIFICATION_ATTEMPT",
    resource: "user",
    resourceId: userId,
    metadata: { providerSuccess: result.success },
    ip,
  });

  if (!result.success) {
    throw new AppError(result.message || "NIN verification failed", 400);
  }

  const nameMatches = namesMatch(user.name, result.firstName, result.lastName);
  const dobMatches = dobMatch(profile.dateOfBirth, result.dateOfBirth);

  if (!nameMatches || !dobMatches) {
    user.ninMismatchCount = (user.ninMismatchCount || 0) + 1;
    user.ninLockedUntil = new Date(Date.now() + NIN_RETRY_COOLDOWN_HOURS * 60 * 60 * 1000);
    await user.save();

    await logAudit({
      userId: user._id,
      action: "NIN_MISMATCH",
      resource: "user",
      resourceId: userId,
      metadata: { nameMatches, dobMatches },
      ip,
    });

    const mismatchParts: string[] = [];
    if (!nameMatches) mismatchParts.push("name");
    if (!dobMatches) mismatchParts.push("date of birth");

    throw new AppError(
      `Your NIN does not match the ${mismatchParts.join(" and ")} on your profile. You can retry in ${NIN_RETRY_COOLDOWN_HOURS} hours.`,
      400,
      {
        mismatch: true,
        nameMatches,
        dobMatches,
        ninLockedUntil: user.ninLockedUntil.toISOString(),
        retryRemainingMs: getNinRetryRemainingMs(user.ninLockedUntil),
      }
    );
  }

  user.ninVerified = true;
  user.status = user.livenessVerified ? "PREMIUM" : "VERIFIED";
  user.encryptedNin = encryptNIN(nin);
  user.ninLockedUntil = undefined;
  user.ninMismatchCount = 0;
  await user.save();

  await logAudit({
    userId: user._id,
    action: "NIN_VERIFIED",
    resource: "user",
    resourceId: userId,
    ip,
  });

  return {
    ninVerified: true,
    status: user.status,
    message: "NIN verified successfully",
  };
};

export const getVerificationStatus = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  const profile = await Profile.findOne({ userId });

  return {
    ...getNinStatusPayload(user),
    profileComplete: !!(user.name && profile?.dateOfBirth),
    registeredName: user.name,
    dateOfBirth: profile?.dateOfBirth ? formatDateOnly(profile.dateOfBirth) : null,
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
