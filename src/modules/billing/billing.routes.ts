import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as billingService from "./billing.service";

const router = Router();

router.get(
  "/account",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const summary = await billingService.getBillingAccountSummary(req.user!._id.toString());
    res.json({ success: true, ...summary });
  })
);

router.get(
  "/charges",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const charges = await billingService.getBillingCharges(req.user!._id.toString());
    res.json({ success: true, charges });
  })
);

router.get(
  "/payments",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const payments = await billingService.getBillingPayments(req.user!._id.toString());
    res.json({ success: true, payments });
  })
);

router.post(
  "/payment-methods/setup",
  requireAuth,
  requireRole("researcher", "admin"),
  validate(Joi.object({ surveyId: Joi.string().optional() })),
  asyncHandler(async (req, res) => {
    const result = await billingService.initializeCardSetup(
      req.user!._id.toString(),
      req.user!.email,
      req.body.surveyId
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/settle-debt",
  requireAuth,
  requireRole("researcher", "admin"),
  asyncHandler(async (req, res) => {
    const result = await billingService.initializeDebtSettlement(
      req.user!._id.toString(),
      req.user!.email
    );
    res.json({ success: true, ...result });
  })
);

export default router;
