import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireTermsAccepted } from "../../middleware/auth";
import * as feedbackService from "./feedback.service";

const router = Router();

router.use(requireAuth, requireTermsAccepted);

router.post(
  "/surveys/:surveyId",
  requireRole("respondent", "admin"),
  validate(
    Joi.object({
      rating: Joi.number().integer().min(1).max(5).required(),
      comment: Joi.string().max(1000).allow("").optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const feedback = await feedbackService.submitSurveyFeedback(
      req.user!._id.toString(),
      String(req.params.surveyId),
      {
        rating: req.body.rating,
        comment: req.body.comment,
      }
    );
    res.status(201).json({ success: true, feedback });
  })
);

export default router;
