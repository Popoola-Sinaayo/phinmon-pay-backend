import { Payment } from "./payment.model";
import { Survey } from "../surveys/survey.model";
import { Withdrawal } from "../wallets/withdrawal.model";
import { Transaction } from "../wallets/transaction.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { AppError } from "../../utils/errors";

export const verifyPayment = async (reference: string) => {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new AppError("Payment not found", 404);

  if (payment.status === "SUCCESS") {
    return { payment, alreadyVerified: true };
  }

  const verification = await paystackService.verifyTransaction(reference);
  if (!verification.success && paystackService.isConfigured()) {
    payment.status = "FAILED";
    await payment.save();
    throw new AppError("Payment verification failed", 400);
  }

  payment.status = "SUCCESS";
  await payment.save();

  const survey = await Survey.findById(payment.surveyId);
  if (survey) {
    survey.status = "ACTIVE";
    await survey.save();
  }

  return { payment, survey, alreadyVerified: false };
};

export const handlePaystackWebhook = async (event: string, data: Record<string, unknown>) => {
  if (event === "charge.success") {
    const reference = data.reference as string;
    if (reference) await verifyPayment(reference);
  }

  if (event === "transfer.success" || event === "transfer.failed") {
    const reference = data.reference as string;
    if (!reference) return;

    const withdrawal = await Withdrawal.findOne({ reference });
    if (!withdrawal) return;

    withdrawal.status = event === "transfer.success" ? "COMPLETED" : "FAILED";
    await withdrawal.save();

    await Transaction.findOneAndUpdate(
      { reference },
      { status: event === "transfer.success" ? "COMPLETED" : "FAILED" }
    );

    if (event === "transfer.failed") {
      const { Wallet } = await import("../wallets/wallet.model");
      const wallet = await Wallet.findOne({ userId: withdrawal.userId });
      if (wallet) {
        wallet.availableBalance += withdrawal.amount;
        await wallet.save();
      }
    }
  }
};
