import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireTermsAccepted } from "../../middleware/auth";
import * as verificationService from "./verification.service";

const router = Router();

router.use(requireAuth, requireTermsAccepted);

router.post(
  "/nin",
  validate(Joi.object({ nin: Joi.string().length(11).pattern(/^\d+$/).required() })),
  asyncHandler(async (req, res) => {
    const result = await verificationService.verifyNIN(
      req.user!._id.toString(),
      req.body.nin,
      req.ip
    );
    res.json({ success: true, ...result });
  })
);

router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const result = await verificationService.getVerificationStatus(req.user!._id.toString());
    res.json({ success: true, ...result });
  })
);

router.post(
  "/liveness/start",
  asyncHandler(async (req, res) => {
    const result = await verificationService.startLiveness(req.user!._id.toString());
    res.json({ success: true, ...result });
  })
);

router.post(
  "/liveness/complete",
  validate(Joi.object({ sessionId: Joi.string().required() })),
  asyncHandler(async (req, res) => {
    const result = await verificationService.completeLiveness(
      req.user!._id.toString(),
      req.body.sessionId
    );
    res.json({ success: true, ...result });
  })
);

export default router;
