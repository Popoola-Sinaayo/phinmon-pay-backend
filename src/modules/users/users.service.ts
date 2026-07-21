import { Profile } from "./profile.model";
import { User } from "./user.model";
import { AppError } from "../../utils/errors";
import { sanitizeUser } from "../../utils/helpers";
import { hashPin, isValidPinFormat, verifyPin } from "../../utils/pin";
import { CURRENT_TERMS_VERSION } from "../../constants/legal";
import { createLogger } from "../../utils/logger";

const log = createLogger("Users");

const loadUserForClient = (userId: string) =>
  User.findById(userId).select("+withdrawalPinHash");

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

export const acceptTerms = async (userId: string, version: string) => {
  if (version !== CURRENT_TERMS_VERSION) {
    throw new AppError("Terms version is out of date. Please refresh and try again.", 400, {
      code: "TERMS_VERSION_MISMATCH",
      currentTermsVersion: CURRENT_TERMS_VERSION,
    });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    {
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    },
    { new: true }
  ).select("+withdrawalPinHash");

  if (!user) throw new AppError("User not found", 404);
  return { user: sanitizeUser(user) };
};

export const requestAccountDeletion = async (userId: string) => {
  const user = await loadUserForClient(userId);
  if (!user) throw new AppError("User not found", 404);

  if (user.deletionRequestedAt) {
    return {
      message: "Deletion request already received. Our team will process it shortly.",
      user: sanitizeUser(user),
    };
  }

  user.deletionRequestedAt = new Date();
  await user.save();
  log.info("Account deletion requested", { userId, email: user.email });

  return {
    message:
      "Deletion request received. We will process it after verifying your identity and settling any open balances.",
    user: sanitizeUser(user),
  };
};

export const completeOnboarding = async (
  userId: string,
  data: {
    name: string;
    dateOfBirth: string;
    gender: string;
    state: string;
    occupation: string;
  }
) => {
  const dob = new Date(data.dateOfBirth);
  if (Number.isNaN(dob.getTime())) {
    throw new AppError("Invalid date of birth", 400);
  }

  const age = calculateAge(dob);
  if (age < 18 || age > 100) {
    throw new AppError("You must be between 18 and 100 years old", 400);
  }

  const user = await User.findByIdAndUpdate(userId, { name: data.name.trim() }, { new: true }).select(
    "+withdrawalPinHash"
  );
  if (!user) throw new AppError("User not found", 404);

  const profileData = {
    dateOfBirth: dob,
    age,
    gender: data.gender,
    state: data.state,
    occupation: data.occupation,
  };

  let profile = await Profile.findOne({ userId });
  if (profile) {
    Object.assign(profile, profileData);
    await profile.save();
  } else {
    profile = await Profile.create({ userId, ...profileData });
  }

  return { user: sanitizeUser(user), profile };
};

export const getProfile = async (userId: string) => {
  const user = await loadUserForClient(userId);
  if (!user) throw new AppError("User not found", 404);
  const profile = await Profile.findOne({ userId });
  return { user: sanitizeUser(user), profile };
};

export const updateProfile = async (
  userId: string,
  data: Partial<{
    name: string;
    dateOfBirth: string;
    gender: string;
    state: string;
    occupation: string;
  }>
) => {
  if (data.name) {
    await User.findByIdAndUpdate(userId, { name: data.name.trim() });
  }

  const profileUpdate: Record<string, unknown> = { userId };
  if (data.gender) profileUpdate.gender = data.gender;
  if (data.state) profileUpdate.state = data.state;
  if (data.occupation) profileUpdate.occupation = data.occupation;
  if (data.dateOfBirth) {
    const dob = new Date(data.dateOfBirth);
    if (Number.isNaN(dob.getTime())) throw new AppError("Invalid date of birth", 400);
    const age = calculateAge(dob);
    if (age < 18 || age > 100) {
      throw new AppError("You must be between 18 and 100 years old", 400);
    }
    profileUpdate.dateOfBirth = dob;
    profileUpdate.age = age;
  }

  const profile = await Profile.findOneAndUpdate({ userId }, profileUpdate, {
    new: true,
    upsert: true,
  });
  const user = await loadUserForClient(userId);
  return { user: sanitizeUser(user!), profile };
};

export const getWithdrawalPinStatus = async (userId: string) => {
  const user = await loadUserForClient(userId);
  if (!user) throw new AppError("User not found", 404);
  return { pinSet: Boolean(user.withdrawalPinHash) };
};

export const setWithdrawalPin = async (
  userId: string,
  data: { pin: string; confirmPin: string; currentPin?: string }
) => {
  if (data.pin !== data.confirmPin) {
    throw new AppError("PIN confirmation does not match", 400);
  }
  if (!isValidPinFormat(data.pin)) {
    throw new AppError("PIN must be 4–6 digits", 400);
  }

  const user = await loadUserForClient(userId);
  if (!user) throw new AppError("User not found", 404);

  if (user.withdrawalPinHash) {
    if (!data.currentPin) {
      throw new AppError("Current PIN is required to change your withdrawal PIN", 400);
    }
    if (!isValidPinFormat(data.currentPin)) {
      throw new AppError("Current PIN must be 4–6 digits", 400);
    }
    const valid = await verifyPin(data.currentPin, user.withdrawalPinHash);
    if (!valid) throw new AppError("Current PIN is incorrect", 403);
  }

  user.withdrawalPinHash = await hashPin(data.pin);
  await user.save();

  return { pinSet: true };
};
