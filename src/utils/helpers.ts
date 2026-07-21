import { IUser } from "../modules/users/user.model";
import { CURRENT_TERMS_VERSION, needsTermsAcceptance } from "../constants/legal";

export const sanitizeUser = (user: IUser) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  ninVerified: user.ninVerified,
  livenessVerified: user.livenessVerified,
  status: user.status,
  withdrawalPinSet: Boolean(user.withdrawalPinHash),
  termsAcceptedAt: user.termsAcceptedAt ?? null,
  termsVersion: user.termsVersion ?? null,
  needsTermsAcceptance: needsTermsAcceptance(user.termsVersion),
  deletionRequestedAt: user.deletionRequestedAt ?? null,
  createdAt: user.createdAt,
  currentTermsVersion: CURRENT_TERMS_VERSION,
});
