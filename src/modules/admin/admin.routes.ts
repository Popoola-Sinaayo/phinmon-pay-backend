import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as adminService from "./admin.service";

const router = Router();

router.use(requireAuth, requireRole("admin"));

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return undefined;
};

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
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await adminService.listUsers({
      page,
      limit,
      role: (req.query.role as string) || undefined,
      status: (req.query.status as string) || undefined,
      ninVerified: parseOptionalBoolean(req.query.ninVerified),
      livenessVerified: parseOptionalBoolean(req.query.livenessVerified),
      q: (req.query.q as string) || undefined,
    });
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

router.get(
  "/emails/preview",
  asyncHandler(async (req, res) => {
    const audience = (req.query.audience as adminService.EmailAudience) || "all";
    const preview = await adminService.previewEmailAudience(audience);
    res.json({ success: true, ...preview });
  })
);

router.post(
  "/emails/send",
  validate(
    Joi.object({
      audience: Joi.string()
        .valid(
          "all",
          "unverified",
          "verified",
          "pending_verification",
          "respondents",
          "researchers",
          "premium"
        )
        .required(),
      template: Joi.string()
        .valid("use_platform", "complete_verification", "custom")
        .required(),
      subject: Joi.string().max(200).when("template", {
        is: "custom",
        then: Joi.required(),
        otherwise: Joi.optional().allow("", null),
      }),
      message: Joi.string().max(5000).when("template", {
        is: "custom",
        then: Joi.required(),
        otherwise: Joi.optional().allow("", null),
      }),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await adminService.sendBulkReminderEmail({
      audience: req.body.audience,
      template: req.body.template,
      subject: req.body.subject,
      message: req.body.message,
      adminUserId: req.user!._id.toString(),
    });
    res.json({ success: true, ...result });
  })
);

export default router;
