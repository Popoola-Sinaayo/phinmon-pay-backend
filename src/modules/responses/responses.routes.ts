import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireNinVerified } from "../../middleware/auth";
import * as responsesService from "./responses.service";
import * as reservationService from "./reservation.service";

const router = Router();

router.post(
  "/surveys/:surveyId/start",
  requireAuth,
  requireRole("respondent", "admin"),
  requireNinVerified,
  asyncHandler(async (req, res) => {
    const result = await reservationService.startSurvey(
      req.user!,
      String(req.params.surveyId)
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/surveys/:surveyId/release",
  requireAuth,
  requireRole("respondent", "admin"),
  asyncHandler(async (req, res) => {
    const result = await reservationService.releaseReservation(
      req.user!._id.toString(),
      String(req.params.surveyId)
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/surveys/:surveyId/responses",
  requireAuth,
  requireRole("respondent", "admin"),
  requireNinVerified,
  validate(
    Joi.object({
      answers: Joi.array()
        .items(
          Joi.object({
            questionId: Joi.string().required(),
            type: Joi.string().required(),
            value: Joi.any().required(),
          })
        )
        .required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await responsesService.submitResponse(
      req.user!,
      String(req.params.surveyId),
      req.body.answers
    );
    res.status(201).json({ success: true, ...result });
  })
);

router.get(
  "/surveys/:surveyId/responses",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const result = await responsesService.getSurveyResponses(
      req.user!._id.toString(),
      String(req.params.surveyId)
    );
    res.json({ success: true, ...result });
  })
);

router.get(
  "/:id",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const response = await responsesService.getResponseById(
      String(req.params.id),
      req.user!.role === "admin" ? undefined : req.user!._id.toString()
    );
    res.json({ success: true, response });
  })
);

router.patch(
  "/:id/status",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(Joi.object({ status: Joi.string().valid("APPROVED", "REJECTED").required() })),
  asyncHandler(async (req, res) => {
    const response = await responsesService.updateResponseStatus(
      req.user!._id.toString(),
      String(req.params.id),
      req.body.status
    );
    res.json({ success: true, response });
  })
);

router.post(
  "/:id/flag",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(Joi.object({ reason: Joi.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const result = await responsesService.flagResponseInvalid(
      req.user!._id.toString(),
      String(req.params.id),
      req.body.reason
    );
    res.json({ success: true, ...result });
  })
);

export default router;
