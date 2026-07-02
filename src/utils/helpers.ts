import { IUser } from "../modules/users/user.model";

export const sanitizeUser = (user: IUser) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  ninVerified: user.ninVerified,
  livenessVerified: user.livenessVerified,
  status: user.status,
  withdrawalPinSet: Boolean(user.withdrawalPinHash),
  createdAt: user.createdAt,
});
