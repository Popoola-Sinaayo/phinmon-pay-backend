import { User } from "../users/user.model";
import { Profile } from "../users/profile.model";
import mongoose from "mongoose";
import { getNINProvider } from "../../providers/nin";
import { getLivenessProvider, isLivenessEnabled } from "../../providers/liveness";
import { encryptNIN, decryptNIN, encryptJSON, hashValue } from "../../utils/encryption";
import { logAudit } from "../admin/auditLog.model";
import { AppError } from "../../utils/errors";
import { createLogger, maskValue } from "../../utils/logger";
import type { NinCachedData } from "./ninCache.types";
import {
  dobMatch,
  formatDateOnly,
  getNinRetryRemainingMs,
  isNinLocked,
  namesMatch,
  NIN_RETRY_COOLDOWN_HOURS,
} from "../../utils/ninMatching";
import config from "../../config";

const log = createLogger("Verification");

const isDuplicateKeyError = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  "code" in err &&
  (err as { code?: number }).code === 11000;

const blockDuplicateNin = async (
  userId: string,
  ninHash: string,
  ip?: string
): Promise<void> => {
  const existing = await User.findOne({ ninHash, _id: { $ne: userId } });
  if (!existing) return;

  log.warn("NIN blocked: already linked to another account", {
    userId,
    existingUserId: existing._id.toString(),
  });

  await logAudit({
    userId: new mongoose.Types.ObjectId(userId),
    action: "NIN_DUPLICATE_BLOCKED",
    resource: "user",
    resourceId: userId,
    metadata: { ninHash },
    ip,
  });

  throw new AppError("This NIN is already linked to another account.", 409, {
    duplicateNin: true,
  });
};

const buildNinCache = (result: {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  providerId?: number;
}): NinCachedData => ({
  firstname: result.firstName || "",
  lastname: result.lastName || "",
  middlename: result.middleName,
  birthdate: result.dateOfBirth,
  gender: result.gender,
  phone: result.phone,
  email: result.email,
  provider: config().NIN_PROVIDER,
  providerId: result.providerId,
  verifiedAt: new Date().toISOString(),
});

const getNinStatusPayload = (user: InstanceType<typeof User>) => {
  const locked = isNinLocked(user.ninLockedUntil);
  const retryRemainingMs = getNinRetryRemainingMs(user.ninLockedUntil);

  return {
    ninVerified: user.ninVerified,
    livenessVerified: user.livenessVerified,
    status: user.status,
    livenessEnabled: isLivenessEnabled(),
    ninLocked: locked,
    ninLockedUntil: user.ninLockedUntil?.toISOString() || null,
    retryRemainingMs,
    retryRemainingHours: Math.ceil(retryRemainingMs / (60 * 60 * 1000)),
    ninMismatchCount: user.ninMismatchCount || 0,
    cooldownHours: NIN_RETRY_COOLDOWN_HOURS,
  };
};

export const verifyNIN = async (userId: string, nin: string, ip?: string) => {
  log.info("NIN verification started", { userId, nin: maskValue(nin), ip });

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  if (nin.length !== 11 || !/^\d+$/.test(nin)) {
    log.warn("NIN rejected: invalid format", { userId });
    throw new AppError("Invalid NIN format. Must be 11 digits.", 400);
  }

  const ninHash = hashValue(nin);

  if (user.ninVerified && user.ninHash === ninHash) {
    log.info("NIN already verified for this user  returning cached result, no API call", {
      userId,
      nin: maskValue(nin),
    });
    return {
      ninVerified: true,
      status: user.status,
      message: "NIN verified successfully",
      cached: true,
    };
  }

  if (user.ninVerified) {
    log.warn("NIN rejected: user already verified with a different NIN", { userId });
    throw new AppError("NIN already verified", 400);
  }

  if (isNinLocked(user.ninLockedUntil)) {
    const hoursLeft = Math.ceil(getNinRetryRemainingMs(user.ninLockedUntil) / (60 * 60 * 1000));
    log.warn("NIN rejected: in cooldown lock", { userId, hoursLeft });
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

  await blockDuplicateNin(userId, ninHash, ip);

  const profile = await Profile.findOne({ userId });
  if (!user.name?.trim()) {
    throw new AppError("Complete your profile with your legal name before NIN verification", 400);
  }
  if (!profile?.dateOfBirth) {
    throw new AppError("Add your date of birth in onboarding before NIN verification", 400);
  }

  log.info("Calling NIN provider", { userId, provider: config().NIN_PROVIDER });
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
    log.warn("NIN provider returned failure", { userId, message: result.message });
    throw new AppError(result.message || "NIN verification failed", 400);
  }

  const nameMatches = namesMatch(user.name, result.firstName, result.lastName);
  const dobMatches = dobMatch(profile.dateOfBirth, result.dateOfBirth);
  log.info("NIN provider match result", { userId, nameMatches, dobMatches });

  if (!nameMatches || !dobMatches) {
    user.ninMismatchCount = (user.ninMismatchCount || 0) + 1;
    user.ninLockedUntil = new Date(Date.now() + NIN_RETRY_COOLDOWN_HOURS * 60 * 60 * 1000);
    await user.save();

    log.warn("NIN mismatch  applying cooldown", {
      userId,
      nameMatches,
      dobMatches,
      mismatchCount: user.ninMismatchCount,
      lockedUntil: user.ninLockedUntil.toISOString(),
    });

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
  user.ninHash = ninHash;
  user.ninData = encryptJSON(buildNinCache(result));
  user.ninLockedUntil = undefined;
  user.ninMismatchCount = 0;

  try {
    await user.save();
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      log.warn("NIN blocked on save: duplicate key race", { userId });
      await logAudit({
        userId: user._id,
        action: "NIN_DUPLICATE_BLOCKED",
        resource: "user",
        resourceId: userId,
        metadata: { ninHash, race: true },
        ip,
      });
      throw new AppError("This NIN is already linked to another account.", 409, {
        duplicateNin: true,
      });
    }
    throw err;
  }

  await logAudit({
    userId: user._id,
    action: "NIN_VERIFIED",
    resource: "user",
    resourceId: userId,
    ip,
  });

  log.info("NIN verified successfully", { userId, status: user.status });

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
  if (!isLivenessEnabled()) {
    throw new AppError("Liveness verification is not enabled", 403);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  if (!user.ninVerified) {
    throw new AppError("Complete NIN verification first", 403);
  }
  if (!user.encryptedNin) {
    throw new AppError("NIN data missing. Complete NIN verification first.", 400);
  }
  if (user.livenessVerified) throw new AppError("Already premium verified", 400);

  log.info("Starting NIN liveness verification session", {
    userId,
    nin: maskValue(decryptNIN(user.encryptedNin)),
  });

  const idNumber = decryptNIN(user.encryptedNin);
  const provider = getLivenessProvider();
  const session = await provider.startVerification(userId, { idNumber });

  log.info("NIN liveness verification session created", {
    userId,
    sessionId: session.sessionId,
  });

  return {
    ...session,
    idNumber,
  };
};

export const completeLiveness = async (userId: string, sessionId: string) => {
  if (!isLivenessEnabled()) {
    throw new AppError("Liveness verification is not enabled", 403);
  }

  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);

  log.info("Completing NIN liveness verification", { userId, sessionId });
  const provider = getLivenessProvider();
  const result = await provider.completeVerification({ userId, sessionId });

  if (!result.success) {
    log.warn("NIN liveness verification failed", { userId, sessionId, message: result.message });
    throw new AppError(result.message || "Liveness verification failed", 400);
  }

  user.livenessVerified = true;
  user.status = "PREMIUM";
  await user.save();

  log.info("NIN liveness verification complete  user is now PREMIUM", { userId });

  return {
    livenessVerified: true,
    status: user.status,
    message: "NIN liveness verification complete",
  };
};
