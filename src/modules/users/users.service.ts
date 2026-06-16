import { Profile } from "./profile.model";
import { User } from "./user.model";
import { AppError } from "../../utils/errors";
import { sanitizeUser } from "../../utils/helpers";

function calculateAge(dateOfBirth: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = today.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
    age -= 1;
  }
  return age;
}

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
  if (age < 16 || age > 100) {
    throw new AppError("You must be between 16 and 100 years old", 400);
  }

  const user = await User.findByIdAndUpdate(userId, { name: data.name.trim() }, { new: true });
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
  const user = await User.findById(userId);
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
    profileUpdate.dateOfBirth = dob;
    profileUpdate.age = calculateAge(dob);
  }

  const profile = await Profile.findOneAndUpdate({ userId }, profileUpdate, {
    new: true,
    upsert: true,
  });
  const user = await User.findById(userId);
  return { user: sanitizeUser(user!), profile };
};
