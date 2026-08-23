import { User } from "../users/user.model";
import { Profile } from "../users/profile.model";
import mongoose from "mongoose";
import { getNINProvider } from "../../providers/nin";
import type { NINResult } from "../../providers/nin/types";
import { getLivenessProvider, isLivenessEnabled } from "../../providers/liveness";
import { encryptNIN, decryptNIN, encryptJSON, hashValue } from "../../utils/encryption";
import { logAudit } from "../admin/auditLog.model";
import { AppError } from "../../utils/errors";
import { createLogger, maskValue } from "../../utils/logger";
import type { NinCachedData } from "./ninCache.types";
import {
  dobMatch,
  formatDateOnly,
  formatNinRetryWait,
  getNinCooldownHours,
  getNinLockUntil,
  getNinRetryRemainingMs,
  isNinLocked,
  namesMatch,
  NIN_RETRY_MAX_HOURS,
} from "../../utils/ninMatching";
import {
  isProviderBillingError,
  PROVIDER_TEMP_UNAVAILABLE_MESSAGE,
} from "../../providers/qoreid/errors";
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

type UserDoc = InstanceType<typeof User>;

const lockDetails = (user: UserDoc) => {
  const retryRemainingMs = getNinRetryRemainingMs(user.ninLockedUntil);
  const attemptCount = user.ninMismatchCount || 0;
  return {
    ninLocked: true,
    ninLockedUntil: user.ninLockedUntil?.toISOString() || null,
    retryRemainingMs,
    cooldownHours: getNinCooldownHours(attemptCount || 1),
    nextCooldownHours: getNinCooldownHours(attemptCount + 1),
  };
};

const throwNinLocked = (user: UserDoc) => {
  const remainingMs = getNinRetryRemainingMs(user.ninLockedUntil);
  const wait = formatNinRetryWait(remainingMs);
  log.warn("Verification rejected: in cooldown lock", {
    userId: user._id.toString(),
    remainingMs,
    attemptCount: user.ninMismatchCount || 0,
  });
  throw new AppError(`Verification locked. Try again in ${wait}.`, 429, lockDetails(user));
};

/**
 * Atomically claim a billed verification attempt and start the cooldown *before*
 * calling Qore ID, so double-clicks / retries cannot drain credits.
 */
const claimVerificationAttempt = async (userId: string): Promise<UserDoc> => {
  const now = new Date();
  const claimed = await User.findOneAndUpdate(
    {
      _id: userId,
      $or: [
        { ninLockedUntil: { $exists: false } },
        { ninLockedUntil: null },
        { ninLockedUntil: { $lte: now } },
      ],
    },
    {
      $inc: { ninMismatchCount: 1 },
      $set: { ninLockedUntil: new Date(now.getTime() + NIN_RETRY_MAX_HOURS * 60 * 60 * 1000) },
    },
    { new: true }
  );

  if (!claimed) {
    const user = await User.findById(userId);
    if (!user) throw new AppError("User not found", 404);
    if (isNinLocked(user.ninLockedUntil)) throwNinLocked(user);
    throw new AppError("Verification locked. Try again later.", 429);
  }

  const hours = getNinCooldownHours(claimed.ninMismatchCount || 1);
  claimed.ninLockedUntil = getNinLockUntil(claimed.ninMismatchCount || 1, now);
  await claimed.save();

  log.info("Claimed billed verification attempt", {
    userId,
    attemptCount: claimed.ninMismatchCount,
    cooldownHours: hours,
    lockedUntil: claimed.ninLockedUntil?.toISOString(),
  });

  return claimed;
};

const clearVerificationLock = (user: UserDoc) => {
  user.set("ninLockedUntil", null);
  user.ninMismatchCount = 0;
};

/** Provider billing/outage — not the user's fault; unlock and show a soft message. */
const throwProviderUnavailable = async (
  user: UserDoc,
  rawMessage?: string
): Promise<never> => {
  log.warn("Identity provider temporarily unavailable (billing/outage sanitized for user)", {
    userId: user._id.toString(),
    rawMessage,
  });
  clearVerificationLock(user);
  await user.save();
  throw new AppError(PROVIDER_TEMP_UNAVAILABLE_MESSAGE, 503, {
    providerUnavailable: true,
  });
};

const getNinStatusPayload = (user: UserDoc) => {
  const locked = isNinLocked(user.ninLockedUntil);
  const retryRemainingMs = getNinRetryRemainingMs(user.ninLockedUntil);
  const attemptCount = user.ninMismatchCount || 0;

  return {
    ninVerified: user.ninVerified,
    livenessVerified: user.livenessVerified,
    status: user.status,
    livenessEnabled: isLivenessEnabled(),
    ninLocked: locked,
    ninLockedUntil: user.ninLockedUntil?.toISOString() || null,
    retryRemainingMs,
    retryRemainingHours: Math.ceil(retryRemainingMs / (60 * 60 * 1000)),
    ninMismatchCount: attemptCount,
    cooldownHours: getNinCooldownHours(attemptCount || 1),
    nextCooldownHours: getNinCooldownHours(attemptCount + 1),
  };
};

export const verifyNIN = async (userId: string, nin: string, ip?: string) => {
  log.info("NIN verification started", { userId, nin: maskValue(nin), ip });

  let user = await User.findById(userId);
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
    throwNinLocked(user);
  }

  await blockDuplicateNin(userId, ninHash, ip);

  const profile = await Profile.findOne({ userId });
  if (!user.name?.trim()) {
    throw new AppError("Complete your profile with your legal name before NIN verification", 400);
  }
  if (!profile?.dateOfBirth) {
    throw new AppError("Add your date of birth in onboarding before NIN verification", 400);
  }

  // Lock before the billed Qore ID call so retries cannot drain credits.
  user = await claimVerificationAttempt(userId);
  const cooldownHours = getNinCooldownHours(user.ninMismatchCount || 1);
  const waitLabel = `${cooldownHours} hour${cooldownHours === 1 ? "" : "s"}`;

  log.info("Calling NIN provider", { userId, provider: config().NIN_PROVIDER });
  const provider = getNINProvider();
  let result: NINResult;
  try {
    result = await provider.verifyNIN({
      nin,
      userId,
      registeredName: user.name,
      registeredDob: formatDateOnly(profile.dateOfBirth),
    });
  } catch (err) {
    log.warn("NIN provider threw  cooldown already applied", {
      userId,
      cooldownHours,
      message: err instanceof Error ? err.message : String(err),
    });
    if (isProviderBillingError(err)) {
      await throwProviderUnavailable(user, err instanceof Error ? err.message : String(err));
    }
    throw new AppError(`NIN verification failed. You can retry in ${waitLabel}.`, 400, {
      providerFailed: true,
      ...lockDetails(user),
    });
  }

  await logAudit({
    userId: user._id,
    action: "NIN_VERIFICATION_ATTEMPT",
    resource: "user",
    resourceId: userId,
    metadata: { providerSuccess: result.success, attemptCount: user.ninMismatchCount },
    ip,
  });

  if (!result.success) {
    log.warn("NIN provider returned failure  cooldown already applied", {
      userId,
      message: result.message,
      cooldownHours,
      providerUnavailable: !!result.providerUnavailable,
    });
    if (result.providerUnavailable || isProviderBillingError(result.message)) {
      await throwProviderUnavailable(user, result.message);
    }
    throw new AppError(
      `${(result.message || "NIN verification failed").replace(/\.?$/, ".")} You can retry in ${waitLabel}.`,
      400,
      {
        providerFailed: true,
        ...lockDetails(user),
      }
    );
  }

  const nameMatches = namesMatch(user.name || "", result.firstName, result.lastName);
  const dobMatches = dobMatch(profile.dateOfBirth, result.dateOfBirth);
  log.info("NIN provider match result", { userId, nameMatches, dobMatches });

  if (!nameMatches || !dobMatches) {
    log.warn("NIN mismatch  cooldown already applied", {
      userId,
      nameMatches,
      dobMatches,
      mismatchCount: user.ninMismatchCount,
      lockedUntil: user.ninLockedUntil?.toISOString(),
    });

    await logAudit({
      userId: user._id,
      action: "NIN_MISMATCH",
      resource: "user",
      resourceId: userId,
      metadata: { nameMatches, dobMatches, attemptCount: user.ninMismatchCount },
      ip,
    });

    const mismatchParts: string[] = [];
    if (!nameMatches) mismatchParts.push("name");
    if (!dobMatches) mismatchParts.push("date of birth");

    throw new AppError(
      `Your NIN does not match the ${mismatchParts.join(" and ")} on your profile. You can retry in ${waitLabel}.`,
      400,
      {
        mismatch: true,
        nameMatches,
        dobMatches,
        ...lockDetails(user),
      }
    );
  }

  user.ninVerified = true;
  user.status = user.livenessVerified ? "PREMIUM" : "VERIFIED";
  user.encryptedNin = encryptNIN(nin);
  user.ninHash = ninHash;
  user.ninData = encryptJSON(buildNinCache(result));
  clearVerificationLock(user);

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
  const premiumLivenessEnabled = isLivenessEnabled();

  return {
    ...getNinStatusPayload(user),
    profileComplete: !!(user.name && profile?.dateOfBirth),
    registeredName: user.name,
    dateOfBirth: profile?.dateOfBirth ? formatDateOnly(profile.dateOfBirth) : null,
    premiumLivenessEnabled,
    premiumLivenessComingSoon: !premiumLivenessEnabled,
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
  if (isNinLocked(user.ninLockedUntil)) throwNinLocked(user);

  const lockedUser = await claimVerificationAttempt(userId);
  const cooldownHours = getNinCooldownHours(lockedUser.ninMismatchCount || 1);
  const waitLabel = `${cooldownHours} hour${cooldownHours === 1 ? "" : "s"}`;

  log.info("Starting NIN liveness verification session", {
    userId,
    nin: maskValue(decryptNIN(user.encryptedNin)),
  });

  try {
    const idNumber = decryptNIN(user.encryptedNin);
    const provider = getLivenessProvider();
    // Pass NIN to the provider for session setup only  do not return raw NIN to the browser.
    const session = await provider.startVerification(userId, { idNumber });

    log.info("NIN liveness verification session created", {
      userId,
      sessionId: session.sessionId,
    });

    const { idNumber: _omitNin, ...safeSession } = session;
    return safeSession;
  } catch (err) {
    log.warn("Liveness session mint failed  cooldown already applied", {
      userId,
      cooldownHours,
      message: err instanceof Error ? err.message : String(err),
    });
    if (isProviderBillingError(err)) {
      await throwProviderUnavailable(
        lockedUser,
        err instanceof Error ? err.message : String(err)
      );
    }
    if (err instanceof AppError) throw err;
    throw new AppError(
      `Could not start liveness verification. You can retry in ${waitLabel}.`,
      400,
      lockDetails(lockedUser)
    );
  }
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
    if (isProviderBillingError(result.message)) {
      await throwProviderUnavailable(user, result.message);
    }
    const wait = formatNinRetryWait(getNinRetryRemainingMs(user.ninLockedUntil));
    throw new AppError(
      `${result.message || "Liveness verification failed"}${
        isNinLocked(user.ninLockedUntil) ? ` You can retry in ${wait}.` : ""
      }`,
      400,
      isNinLocked(user.ninLockedUntil) ? lockDetails(user) : undefined
    );
  }

  user.livenessVerified = true;
  user.status = "PREMIUM";
  clearVerificationLock(user);
  await user.save();

  log.info("NIN liveness verification complete  user is now PREMIUM", { userId });

  return {
    livenessVerified: true,
    status: user.status,
    message: "NIN liveness verification complete",
  };
};
