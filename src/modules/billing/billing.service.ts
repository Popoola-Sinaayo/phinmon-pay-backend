import { v4 as uuidv4 } from "uuid";
import { PaymentMethod } from "./paymentMethod.model";
import { ResearcherBilling } from "./researcherBilling.model";
import { BillingCharge } from "./billingCharge.model";
import { Payment } from "../payments/payment.model";
import { Survey, ISurvey } from "../surveys/survey.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { calculatePerResponseCost } from "../../utils/surveyHelpers";
import { AppError } from "../../utils/errors";
import config from "../../config";

const CARD_SETUP_AMOUNT = 100;

export const getOrCreateBillingAccount = async (researcherId: string) => {
  let account = await ResearcherBilling.findOne({ researcherId });
  if (!account) {
    account = await ResearcherBilling.create({ researcherId });
  }
  return account;
};

export const getBillingAccountSummary = async (researcherId: string) => {
  const account = await getOrCreateBillingAccount(researcherId);
  const paymentMethod = account.defaultPaymentMethodId
    ? await PaymentMethod.findById(account.defaultPaymentMethodId)
    : null;
  const lockedSurveys = await Survey.find({
    researcherId,
    billingLocked: true,
  }).select("title status billingLockReason amountSpent spendingCap billingModel");

  return { account, paymentMethod, lockedSurveys };
};

export const getBillingCharges = async (researcherId: string) => {
  return BillingCharge.find({ researcherId }).sort({ createdAt: -1 }).limit(100);
};

export const getBillingPayments = async (researcherId: string) => {
  return Payment.find({ researcherId }).sort({ createdAt: -1 }).limit(100);
};

export const savePaymentMethod = async (
  researcherId: string,
  authorization: {
    authorizationCode: string;
    reusable: boolean;
    cardType: string;
    last4: string;
    expMonth: string;
    expYear: string;
    bank: string;
  }
) => {
  if (!authorization.reusable && paystackService.isConfigured()) {
    throw new AppError("Card cannot be saved for future charges", 400);
  }

  await PaymentMethod.updateMany({ researcherId }, { isDefault: false });

  const method = await PaymentMethod.create({
    researcherId,
    paystackAuthorizationCode: authorization.authorizationCode,
    last4: authorization.last4,
    expMonth: authorization.expMonth,
    expYear: authorization.expYear,
    brand: authorization.cardType,
    bank: authorization.bank,
    isDefault: true,
    isActive: true,
  });

  const account = await getOrCreateBillingAccount(researcherId);
  account.defaultPaymentMethodId = method._id;
  if (account.status !== "LOCKED") account.status = "ACTIVE";
  await account.save();

  return method;
};

export const initializeCardSetup = async (
  researcherId: string,
  email: string,
  surveyId?: string
) => {
  const reference = `CARD-${uuidv4()}`;
  const payment = await Payment.create({
    researcherId,
    surveyId,
    amount: CARD_SETUP_AMOUNT,
    reference,
    status: "PENDING",
    purpose: "CARD_SETUP",
    provider: "paystack",
    metadata: { surveyId, action: "save_card" },
  });

  const init = await paystackService.initializeTransaction({
    email,
    amount: CARD_SETUP_AMOUNT,
    reference,
    callbackUrl: `${config().FRONTEND_URL}/researcher/billing/callback`,
    metadata: { paymentId: payment._id.toString(), surveyId, purpose: "CARD_SETUP" },
  });

  payment.paystackAccessCode = init.accessCode;
  payment.authorizationUrl = init.authorizationUrl;
  await payment.save();

  return { authorizationUrl: init.authorizationUrl, reference };
};

export const initializeDebtSettlement = async (researcherId: string, email: string) => {
  const account = await getOrCreateBillingAccount(researcherId);
  if (account.outstandingDebt <= 0) {
    throw new AppError("No outstanding balance to settle", 400);
  }

  const reference = `DEBT-${uuidv4()}`;
  const payment = await Payment.create({
    researcherId,
    amount: account.outstandingDebt,
    reference,
    status: "PENDING",
    purpose: "DEBT_SETTLEMENT",
    provider: "paystack",
    metadata: { debtAmount: account.outstandingDebt },
  });

  const init = await paystackService.initializeTransaction({
    email,
    amount: account.outstandingDebt,
    reference,
    callbackUrl: `${config().FRONTEND_URL}/researcher/billing/callback`,
    metadata: { paymentId: payment._id.toString(), purpose: "DEBT_SETTLEMENT" },
  });

  payment.paystackAccessCode = init.accessCode;
  payment.authorizationUrl = init.authorizationUrl;
  await payment.save();

  return { authorizationUrl: init.authorizationUrl, reference, amount: account.outstandingDebt };
};

export const lockSurvey = async (survey: ISurvey, reason: string) => {
  survey.billingLocked = true;
  survey.billingLockReason = reason;
  if (survey.status === "ACTIVE") survey.status = "PAUSED";
  await survey.save();

  const account = await getOrCreateBillingAccount(survey.researcherId.toString());
  account.status = "PAST_DUE";
  await account.save();
};

export const unlockResearcherSurveys = async (researcherId: string) => {
  await Survey.updateMany(
    { researcherId, billingLocked: true },
    {
      $set: {
        billingLocked: false,
        billingLockReason: undefined,
        status: "ACTIVE",
      },
    }
  );

  const account = await getOrCreateBillingAccount(researcherId);
  account.outstandingDebt = 0;
  account.status = "ACTIVE";
  await account.save();
};

export const canAcceptPaygResponse = (survey: ISurvey) => {
  if (survey.billingModel !== "PAYG") return true;
  if (survey.billingLocked) return false;

  const chargeAmount = calculatePerResponseCost(survey.payoutPerResponse);
  const cap = survey.spendingCap || survey.totalCost;
  if (survey.amountSpent + chargeAmount > cap) return false;

  return true;
};

export const chargeForResponse = async (
  researcherId: string,
  email: string,
  survey: ISurvey,
  responseId: string
) => {
  const chargeAmount = calculatePerResponseCost(survey.payoutPerResponse);
  const cap = survey.spendingCap || survey.totalCost;

  if (survey.amountSpent + chargeAmount > cap) {
    await lockSurvey(survey, "Spending cap reached");
    throw new AppError("Campaign spending cap reached", 402);
  }

  const account = await getOrCreateBillingAccount(researcherId);
  if (account.outstandingDebt > 0) {
    await lockSurvey(survey, "Outstanding balance must be settled");
    throw new AppError("Campaign billing locked due to outstanding balance", 402);
  }

  const paymentMethod = account.defaultPaymentMethodId
    ? await PaymentMethod.findById(account.defaultPaymentMethodId)
    : await PaymentMethod.findOne({ researcherId, isDefault: true, isActive: true });

  if (!paymentMethod) {
    await lockSurvey(survey, "No payment method on file");
    throw new AppError("Researcher has no saved payment method", 402);
  }

  const reference = `PAYG-${uuidv4()}`;
  const charge = await BillingCharge.create({
    researcherId,
    surveyId: survey._id,
    responseId,
    amount: chargeAmount,
    reference,
    type: "RESPONSE_CHARGE",
    status: "PENDING",
  });

  const result = await paystackService.chargeAuthorization({
    authorizationCode: paymentMethod.paystackAuthorizationCode,
    email,
    amount: chargeAmount,
    reference,
    metadata: {
      surveyId: survey._id.toString(),
      responseId,
      type: "RESPONSE_CHARGE",
    },
  });

  if (!result.success) {
    charge.status = "FAILED";
    charge.failureReason = result.message || "Card charge failed";
    await charge.save();

    account.outstandingDebt += chargeAmount;
    account.status = "PAST_DUE";
    await account.save();

    await lockSurvey(survey, result.message || "Card charge failed");

    throw new AppError("Payment failed — campaign paused until balance is settled", 402);
  }

  charge.status = "SUCCESS";
  await charge.save();

  survey.amountSpent += chargeAmount;
  if (survey.amountSpent >= cap) {
    survey.billingLocked = true;
    survey.billingLockReason = "Spending cap reached";
    if (survey.status === "ACTIVE") survey.status = "PAUSED";
  }
  await survey.save();

  account.totalSpent += chargeAmount;
  await account.save();

  return { chargeAmount, reference };
};

export const activatePaygSurvey = async (survey: ISurvey) => {
  survey.status = "ACTIVE";
  survey.billingLocked = false;
  survey.billingLockReason = undefined;
  await survey.save();
  return survey;
};

export const handleCardSetupSuccess = async (
  researcherId: string,
  payment: InstanceType<typeof Payment>,
  authorization?: {
    authorizationCode: string;
    reusable: boolean;
    cardType: string;
    last4: string;
    expMonth: string;
    expYear: string;
    bank: string;
  }
) => {
  if (authorization) {
    await savePaymentMethod(researcherId, authorization);
  } else if (!paystackService.isConfigured()) {
    await savePaymentMethod(researcherId, {
      authorizationCode: `AUTH_mock_${researcherId}`,
      reusable: true,
      cardType: "visa",
      last4: "4081",
      expMonth: "12",
      expYear: "2030",
      bank: "TEST BANK",
    });
  }

  await BillingCharge.create({
    researcherId,
    surveyId: payment.surveyId,
    amount: payment.amount,
    reference: payment.reference,
    type: "CARD_SETUP",
    status: "SUCCESS",
  });

  const account = await getOrCreateBillingAccount(researcherId);

  if (account.outstandingDebt > 0) {
    return { requiresDebtPayment: true, outstandingDebt: account.outstandingDebt };
  }

  if (payment.surveyId) {
    const survey = await Survey.findById(payment.surveyId);
    if (survey && survey.billingModel === "PAYG" && survey.status === "PENDING_PAYMENT") {
      await activatePaygSurvey(survey);
    }
  }

  await unlockResearcherSurveys(researcherId);
  return { requiresDebtPayment: false, outstandingDebt: 0 };
};

export const handleDebtSettlementSuccess = async (
  researcherId: string,
  payment: InstanceType<typeof Payment>
) => {
  await BillingCharge.create({
    researcherId,
    amount: payment.amount,
    reference: payment.reference,
    type: "DEBT_SETTLEMENT",
    status: "SUCCESS",
  });

  await unlockResearcherSurveys(researcherId);
};
