import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireTermsAccepted } from "../../middleware/auth";
import * as analyticsService from "./analytics.service";

const router = Router();

router.use(requireAuth, requireTermsAccepted);

router.get(
  "/surveys/:id/suggestions",
  requireRole("researcher", "admin"),
  asyncHandler(async (_req, res) => {
    res.json({ success: true, suggestions: analyticsService.getAnalyticsSuggestions() });
  })
);

router.post(
  "/surveys/:id/ask",
  requireRole("researcher", "admin"),
  validate(Joi.object({ question: Joi.string().min(3).max(1000).required() })),
  asyncHandler(async (req, res) => {
    const result = await analyticsService.askSurveyAnalytics(
      req.user!._id.toString(),
      String(req.params.id),
      req.body.question
    );
    res.json({ success: true, ...result });
  })
);

export default router;
