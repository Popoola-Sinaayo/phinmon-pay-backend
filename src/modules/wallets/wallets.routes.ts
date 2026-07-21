import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import { requireAuth, requireRole, requireNinVerified, requireTermsAccepted } from "../../middleware/auth";
import * as walletsService from "./wallets.service";

const router = Router();

router.get(
  "/",
  requireAuth,
  requireTermsAccepted,
  asyncHandler(async (req, res) => {
    const wallet = await walletsService.getWallet(req.user!._id.toString());
    res.json({ success: true, wallet });
  })
);

router.get(
  "/dashboard",
  requireAuth,
  requireTermsAccepted,
  requireRole("respondent", "admin"),
  asyncHandler(async (req, res) => {
    const dashboard = await walletsService.getRespondentDashboard(req.user!._id.toString());
    res.json({ success: true, dashboard });
  })
);

router.get(
  "/transactions",
  requireAuth,
  requireTermsAccepted,
  asyncHandler(async (req, res) => {
    const transactions = await walletsService.getTransactions(req.user!._id.toString());
    res.json({ success: true, transactions });
  })
);

router.get(
  "/banks",
  asyncHandler(async (_req, res) => {
    const banks = await walletsService.listBanks();
    res.json({ success: true, banks });
  })
);

router.post(
  "/resolve-account",
  requireAuth,
  requireTermsAccepted,
  requireNinVerified,
  validate(
    Joi.object({
      bankCode: Joi.string().required(),
      accountNumber: Joi.string().length(10).pattern(/^\d+$/).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const result = await walletsService.resolveBankAccount(
      req.body.accountNumber,
      req.body.bankCode
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/bank-accounts",
  requireAuth,
  requireTermsAccepted,
  requireNinVerified,
  validate(
    Joi.object({
      bankName: Joi.string().required(),
      bankCode: Joi.string().required(),
      accountNumber: Joi.string().length(10).pattern(/^\d+$/).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const account = await walletsService.addBankAccount(req.user!._id.toString(), req.body);
    res.status(201).json({ success: true, account });
  })
);

router.get(
  "/bank-accounts",
  requireAuth,
  requireTermsAccepted,
  asyncHandler(async (req, res) => {
    const accounts = await walletsService.getBankAccounts(req.user!._id.toString());
    res.json({ success: true, accounts });
  })
);

router.get(
  "/withdrawals/:id",
  requireAuth,
  requireTermsAccepted,
  requireRole("respondent", "admin"),
  asyncHandler(async (req, res) => {
    const result = await walletsService.getWithdrawalStatus(
      req.user!._id.toString(),
      String(req.params.id)
    );
    res.json({ success: true, ...result });
  })
);

router.post(
  "/withdrawals",
  requireAuth,
  requireTermsAccepted,
  requireRole("respondent", "admin"),
  requireNinVerified,
  validate(
    Joi.object({
      amount: Joi.number().min(100).required(),
      bankId: Joi.string().required(),
      pin: Joi.string().pattern(/^\d{4,6}$/).required(),
    })
  ),
  asyncHandler(async (req, res) => {
    const withdrawal = await walletsService.requestWithdrawal(
      req.user!._id.toString(),
      req.body.amount,
      req.body.bankId,
      req.body.pin
    );
    res.status(201).json({ success: true, withdrawal });
  })
);

export default router;
