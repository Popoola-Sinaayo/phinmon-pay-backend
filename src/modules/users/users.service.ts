import { Profile } from "./profile.model";
import { User } from "./user.model";
import { AppError } from "../../utils/errors";
import { sanitizeUser } from "../../utils/helpers";

export const completeOnboarding = async (
  userId: string,
  data: {
    name: string;
    age: number;
    gender: string;
    state: string;
    occupation: string;
  }
) => {
  const user = await User.findByIdAndUpdate(
    userId,
    { name: data.name },
    { new: true }
  );
  if (!user) throw new AppError("User not found", 404);

  let profile = await Profile.findOne({ userId });
  if (profile) {
    Object.assign(profile, data);
    await profile.save();
  } else {
    profile = await Profile.create({ userId, ...data });
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
  data: Partial<{ name: string; age: number; gender: string; state: string; occupation: string }>
) => {
  if (data.name) {
    await User.findByIdAndUpdate(userId, { name: data.name });
  }
  const profile = await Profile.findOneAndUpdate(
    { userId },
    { userId, ...data },
    { new: true, upsert: true }
  );
  const user = await User.findById(userId);
  return { user: sanitizeUser(user!), profile };
};
