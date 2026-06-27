import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as adminService from "./admin.service";

const router = Router();

router.use(requireAuth, requireRole("admin"));

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const stats = await adminService.getAdminStats();
    res.json({ success: true, stats });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const result = await adminService.listUsers(page);
    res.json({ success: true, ...result });
  })
);

router.patch(
  "/users/:id",
  validate(
    Joi.object({
      role: Joi.string().valid("respondent", "researcher", "admin").optional(),
      ninVerified: Joi.boolean().optional(),
      livenessVerified: Joi.boolean().optional(),
      status: Joi.string()
        .valid("PENDING_VERIFICATION", "VERIFIED", "PREMIUM", "SUSPENDED")
        .optional(),
      name: Joi.string().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await adminService.updateUser(String(req.params.id), req.body);
    res.json({ success: true, user });
  })
);

router.get(
  "/surveys",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const result = await adminService.listSurveys(page);
    res.json({ success: true, ...result });
  })
);

router.patch(
  "/surveys/:id/status",
  validate(Joi.object({ status: Joi.string().required() })),
  asyncHandler(async (req, res) => {
    const survey = await adminService.updateSurveyStatus(String(req.params.id), req.body.status);
    res.json({ success: true, survey });
  })
);

router.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const result = await adminService.listTransactions(page);
    res.json({ success: true, ...result });
  })
);

router.get(
  "/withdrawals",
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const result = await adminService.listWithdrawals(page);
    res.json({ success: true, ...result });
  })
);

router.get(
  "/verification/queue",
  asyncHandler(async (_req, res) => {
    const queue = await adminService.getVerificationQueue();
    res.json({ success: true, queue });
  })
);

router.get(
  "/fraud/flags",
  asyncHandler(async (_req, res) => {
    const flags = await adminService.getFraudFlags();
    res.json({ success: true, flags });
  })
);

export default router;
