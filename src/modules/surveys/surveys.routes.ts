import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as surveysService from "./surveys.service";

const questionSchema = Joi.object({
  questionId: Joi.string().optional(),
  questionText: Joi.string().required(),
  type: Joi.string()
    .valid(
      "text",
      "text_short",
      "text_long",
      "single_choice",
      "multiple_choice",
      "number",
      "rating",
      "boolean"
    )
    .required(),
  required: Joi.boolean().default(true),
  options: Joi.array().items(Joi.string()).optional(),
  configuration: Joi.object().optional(),
});

const router = Router();

router.post(
  "/preview-cost",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(
    Joi.object({
      questions: Joi.array().items(questionSchema).default([]),
      responsesNeeded: Joi.number().min(1).required(),
      targetAudience: Joi.string()
        .valid("ALL_VERIFIED", "PREMIUM_ONLY")
        .default("ALL_VERIFIED"),
      aiSpamFilterEnabled: Joi.boolean().default(false),
      aiAnalyticsEnabled: Joi.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const pricing = surveysService.previewSurveyCost(req.body);
    res.json({
      success: true,
      estimatedTimeSeconds: pricing.estimatedCompletionTimeSeconds,
      estimatedTimeMinutes: pricing.estimatedCompletionTimeMinutes,
      rewardPerResponseStandard: pricing.rewardPerResponseStandard,
      rewardPerResponsePremium: pricing.rewardPerResponsePremium,
      platformFeeRate: pricing.platformFeeRate,
      platformFeeAmount: pricing.platformFeeAmount,
      aiSpamFilterCost: pricing.aiSpamFilterCost,
      aiAnalyticsCost: pricing.aiAnalyticsCost,
      aiAddOnsCost: pricing.aiAddOnsCost,
      totalCost: pricing.totalCost,
      highComplexity: pricing.highComplexity,
    });
  })
);

router.post(
  "/",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(
    Joi.object({
      title: Joi.string().required(),
      description: Joi.string().required(),
      category: Joi.string().optional(),
      targetAudience: Joi.string().valid("ALL_VERIFIED", "PREMIUM_ONLY").default("ALL_VERIFIED"),
      responsesNeeded: Joi.number().min(1).required(),
      aiSpamFilterEnabled: Joi.boolean().default(false),
      aiAnalyticsEnabled: Joi.boolean().default(false),
      draftStep: Joi.number().min(0).max(6).optional(),
      questions: Joi.array().items(questionSchema).default([]),
    })
  ),
  asyncHandler(async (req, res) => {
    const survey = await surveysService.createSurvey(req.user!._id.toString(), req.body);
    res.status(201).json({ success: true, survey });
  })
);

router.get(
  "/mine",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const surveys = await surveysService.getResearcherSurveys(req.user!._id.toString());
    res.json({ success: true, surveys });
  })
);

router.get(
  "/available",
  requireAuth,
  requireRole("respondent", "admin"),
  asyncHandler(async (req, res) => {
    const surveys = await surveysService.getAvailableSurveys(
      req.user!._id.toString(),
      req.user!.ninVerified,
      req.user!.livenessVerified,
      req.query.filter as string | undefined
    );
    res.json({ success: true, surveys });
  })
);

router.get(
  "/dashboard",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const dashboard = await surveysService.getResearcherDashboard(req.user!._id.toString());
    res.json({ success: true, dashboard });
  })
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const isResearcher = ["researcher", "admin"].includes(req.user!.role);
    const survey = await surveysService.getSurveyById(
      String(req.params.id),
      isResearcher ? req.user!._id.toString() : undefined
    );
    res.json({ success: true, survey });
  })
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(
    Joi.object({
      title: Joi.string().optional(),
      description: Joi.string().optional(),
      category: Joi.string().optional(),
      targetAudience: Joi.string().valid("ALL_VERIFIED", "PREMIUM_ONLY").optional(),
      responsesNeeded: Joi.number().min(1).optional(),
      aiSpamFilterEnabled: Joi.boolean().optional(),
      aiAnalyticsEnabled: Joi.boolean().optional(),
      draftStep: Joi.number().min(0).max(6).optional(),
      questions: Joi.array().items(questionSchema).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const survey = await surveysService.updateSurvey(
      req.user!._id.toString(),
      String(req.params.id),
      req.body
    );
    res.json({ success: true, survey });
  })
);

router.post(
  "/:id/launch",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(Joi.object({})),
  asyncHandler(async (req, res) => {
    const result = await surveysService.launchSurvey(
      req.user!._id.toString(),
      String(req.params.id),
      req.user!.email
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/:id/enable-analytics",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(Joi.object({})),
  asyncHandler(async (req, res) => {
    const result = await surveysService.purchaseAnalyticsAddon(
      req.user!._id.toString(),
      String(req.params.id),
      req.user!.email
    );
    res.json({ success: true, ...result });
  })
);

router.get(
  "/:id/export",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const { csv, filename } = await surveysService.exportSurveyResponses(
      req.user!._id.toString(),
      String(req.params.id)
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  })
);

export default router;
