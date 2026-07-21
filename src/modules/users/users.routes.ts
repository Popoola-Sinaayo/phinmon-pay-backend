import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireTermsAccepted } from "../../middleware/auth";
import * as usersService from "./users.service";
import { CURRENT_TERMS_VERSION } from "../../constants/legal";

const router = Router();

router.post(
  "/accept-terms",
  requireAuth,
  validate(
    Joi.object({
      version: Joi.string().valid(CURRENT_TERMS_VERSION).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await usersService.acceptTerms(req.user!._id.toString(), req.body.version);
    res.json({ success: true, ...result });
  })
);

router.use(requireAuth, requireTermsAccepted);

router.post(
  "/deletion-request",
  asyncHandler(async (req, res) => {
    const result = await usersService.requestAccountDeletion(req.user!._id.toString());
    res.json({ success: true, ...result });
  })
);

router.post(
  "/onboarding",
  validate(
    Joi.object({
      name: Joi.string().min(2).required(),
      dateOfBirth: Joi.string().isoDate().required(),
      gender: Joi.string().required(),
      state: Joi.string().required(),
      occupation: Joi.string().required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await usersService.completeOnboarding(req.user!._id.toString(), req.body);
    res.json({ success: true, ...result });
  })
);

router.get(
  "/profile",
  asyncHandler(async (req, res) => {
    const result = await usersService.getProfile(req.user!._id.toString());
    res.json({ success: true, ...result });
  })
);

router.patch(
  "/profile",
  validate(
    Joi.object({
      name: Joi.string().min(2).optional(),
      dateOfBirth: Joi.string().isoDate().optional(),
      gender: Joi.string().optional(),
      state: Joi.string().optional(),
      occupation: Joi.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await usersService.updateProfile(req.user!._id.toString(), req.body);
    res.json({ success: true, ...result });
  })
);

const pinSchema = Joi.object({
  pin: Joi.string().pattern(/^\d{4,6}$/).required(),
  confirmPin: Joi.string().pattern(/^\d{4,6}$/).required(),
  currentPin: Joi.string().pattern(/^\d{4,6}$/).optional(),
});

router.get(
  "/withdrawal-pin/status",
  asyncHandler(async (req, res) => {
    const status = await usersService.getWithdrawalPinStatus(req.user!._id.toString());
    res.json({ success: true, ...status });
  })
);

router.post(
  "/withdrawal-pin",
  validate(pinSchema),
  asyncHandler(async (req, res) => {
    const result = await usersService.setWithdrawalPin(req.user!._id.toString(), req.body);
    res.json({ success: true, ...result });
  })
);

export default router;
