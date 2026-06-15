import { Router } from "express";
import rateLimit from "express-rate-limit";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth } from "../../middleware/auth";
import * as authService from "./auth.service";

const router = Router();

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many OTP requests" },
});

router.post(
  "/request-otp",
  otpLimiter,
  validate(
    Joi.object({
      email: Joi.string().email().required(),
      role: Joi.string().valid("respondent", "researcher").optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await authService.requestOtp(req.body.email, req.body.role);
    res.json({ success: true, ...result });
  })
);

router.post(
  "/verify-otp",
  validate(
    Joi.object({
      email: Joi.string().email().required(),
      code: Joi.string().length(6).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { token, user } = await authService.verifyOtp(req.body.email, req.body.code);
    authService.setAuthCookie(res, token);
    res.json({ success: true, token, user });
  })
);

router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie("token");
    res.json({ success: true, message: "Logged out" });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!._id.toString());
    res.json({ success: true, user });
  })
);

export default router;
