import jwt from "jsonwebtoken";
import { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import config from "../../config";
import { OtpCode } from "./otp.model";
import { User } from "../users/user.model";
import { Wallet } from "../wallets/wallet.model";
import { getEmailProvider } from "../../providers/email";
import { otpEmailTemplate, welcomeEmailTemplate, sanitizeUser } from "../../utils/helpers";
import { AppError } from "../../utils/errors";

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

export const requestOtp = async (email: string, role?: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  let user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const validRole = role === "researcher" ? "researcher" : "respondent";
    user = await User.create({ email: normalizedEmail, role: validRole });
    await Wallet.create({ userId: user._id });
    const emailProvider = getEmailProvider();
    await emailProvider.send({
      to: normalizedEmail,
      subject: "Welcome to InsightPay",
      html: welcomeEmailTemplate(""),
    });
  }

  await OtpCode.deleteMany({ email: normalizedEmail });
  const code = generateOtp();
  await OtpCode.create({
    email: normalizedEmail,
    code,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    used: false,
  });

  const emailProvider = getEmailProvider();
  await emailProvider.send({
    to: normalizedEmail,
    subject: "Your InsightPay verification code",
    html: otpEmailTemplate(code),
  });

  return { message: "OTP sent successfully" };
};

export const verifyOtp = async (email: string, code: string) => {
  const normalizedEmail = email.toLowerCase().trim();
  const otpDoc = await OtpCode.findOne({ email: normalizedEmail, used: false }).sort({
    createdAt: -1,
  });

  if (!otpDoc) throw new AppError("OTP not found", 404);
  if (otpDoc.code !== code) throw new AppError("Invalid OTP", 400);
  if (otpDoc.expiresAt < new Date()) throw new AppError("OTP has expired", 400);

  otpDoc.used = true;
  await otpDoc.save();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) throw new AppError("User not found", 404);

  const token = jwt.sign({ id: user._id, email: user.email }, config().JWT_SECRET, {
    expiresIn: config().JWT_EXPIRES_IN,
  } as jwt.SignOptions);

  return { token, user: sanitizeUser(user) };
};

export const setAuthCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: config().NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

export const getMe = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) throw new AppError("User not found", 404);
  return sanitizeUser(user);
};
