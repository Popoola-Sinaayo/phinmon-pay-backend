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

export const otpEmailTemplate = (code: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color: #7b61ff;">Phinmon</h2>
    <p>Your verification code is:</p>
    <h1 style="letter-spacing: 8px; color: #1e40af;">${code}</h1>
    <p>This code expires in 10 minutes.</p>
  </div>
`;

export const welcomeEmailTemplate = (name: string) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color: #7b61ff;">Welcome to Phinmon${name ? `, ${name}` : ""}!</h2>
    <p>Start earning by completing verified surveys or launch your first research campaign.</p>
  </div>
`;
