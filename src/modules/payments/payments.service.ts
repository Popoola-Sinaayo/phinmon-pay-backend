import { Payment } from "./payment.model";
import { Survey } from "../surveys/survey.model";
import { syncWithdrawalByReference } from "../wallets/withdrawalSync";
import { notifyEligibleUsersOfNewSurvey } from "../notifications/surveyNotifications.service";
import { paystackService } from "../../providers/paystack/paystack.service";
import { AppError } from "../../utils/errors";
import { createLogger } from "../../utils/logger";

const log = createLogger("Payments");

export const verifyPayment = async (reference: string) => {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new AppError("Payment not found", 404);

  if (payment.status === "SUCCESS") {
    return { payment, alreadyVerified: true, purpose: payment.purpose };
  }

  const verification = await paystackService.verifyTransaction(reference);
  if (!verification.success && paystackService.isConfigured()) {
    payment.status = "FAILED";
    await payment.save();
    throw new AppError("Payment verification failed", 400);
  }

  payment.status = "SUCCESS";
  await payment.save();

  if (payment.purpose === "PREPAID") {
    const survey = await Survey.findById(payment.surveyId);
    if (survey && survey.status === "PENDING_PAYMENT") {
      survey.status = "ACTIVE";
      await survey.save();
      void notifyEligibleUsersOfNewSurvey(survey._id.toString()).catch((err) => {
        log.error("Failed to send new survey notifications", {
          surveyId: survey._id.toString(),
          message: (err as Error).message,
        });
      });
    }
    return { payment, survey, alreadyVerified: false, purpose: payment.purpose };
  }

  if (payment.purpose === "AI_ANALYTICS_ADDON") {
    const survey = await Survey.findById(payment.surveyId);
    if (survey && !survey.aiAnalyticsEnabled) {
      survey.aiAnalyticsEnabled = true;
      survey.aiAnalyticsCost = payment.amount;
      survey.aiAddOnsCost = (survey.aiAddOnsCost || 0) + payment.amount;
      survey.totalCost = (survey.totalCost || 0) + payment.amount;
      await survey.save();
    }
    return { payment, survey, alreadyVerified: false, purpose: payment.purpose };
  }

  return { payment, alreadyVerified: false, purpose: payment.purpose };
};

export const handlePaystackWebhook = async (event: string, data: Record<string, unknown>) => {
  log.info("Paystack webhook received", { event, reference: data.reference });

  if (event === "charge.success") {
    const reference = data.reference as string;
    if (reference) await verifyPayment(reference);
  }

  if (event === "charge.failed") {
    const reference = data.reference as string;
    if (!reference) return;
    const payment = await Payment.findOne({ reference });
    if (payment && payment.status === "PENDING") {
      payment.status = "FAILED";
      await payment.save();
    }
  }

  if (event === "transfer.success" || event === "transfer.failed") {
    const reference = data.reference as string;
    const transferCode = data.transfer_code as string | undefined;
    log.info("Transfer webhook — syncing withdrawal", {
      event,
      reference,
      transferCode,
      paystackStatus: data.status,
    });
    if (!reference) {
      log.warn("Transfer webhook missing reference", { event, data });
      return;
    }
    const result = await syncWithdrawalByReference(reference);
    log.info("Transfer webhook sync result", {
      reference,
      withdrawalStatus: result?.status,
    });
  }
};
