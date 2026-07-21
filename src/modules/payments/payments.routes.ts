import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireAuth, requireTermsAccepted } from "../../middleware/auth";
import { paystackService } from "../../providers/paystack/paystack.service";
import * as paymentsService from "./payments.service";
import { AppError } from "../../utils/errors";

const router = Router();

router.post(
  "/paystack/verify",
  requireAuth,
  requireTermsAccepted,
  asyncHandler(async (req, res) => {
    const { reference } = req.body;
    if (!reference) throw new AppError("Reference is required", 400);
    const result = await paymentsService.verifyPayment(reference);
    res.json({ success: true, ...result });
  })
);

router.post(
  "/webhooks/paystack",
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-paystack-signature"] as string;
    const rawBody = JSON.stringify(req.body);

    if (!paystackService.verifyWebhookSignature(rawBody, signature || "")) {
      throw new AppError("Invalid webhook signature", 401);
    }

    const { event, data } = req.body;
    await paymentsService.handlePaystackWebhook(event, data);
    res.json({ success: true });
  })
);

export default router;
