import { Wallet } from "./wallet.model";
import { Transaction } from "./transaction.model";
import { Withdrawal, IWithdrawal } from "./withdrawal.model";
import { paystackService } from "../../providers/paystack/paystack.service";
import { createLogger } from "../../utils/logger";

const log = createLogger("WithdrawalSync");

const TERMINAL_SUCCESS = new Set(["success"]);
const TERMINAL_FAILURE = new Set(["failed", "reversed", "abandoned"]);

const restoreWalletOnFailedWithdrawal = async (withdrawal: IWithdrawal) => {
  const wallet = await Wallet.findOne({ userId: withdrawal.userId });
  if (!wallet) return;

  wallet.availableBalance += withdrawal.amount;
  await wallet.save();
};

/** Confirm a withdrawal against Paystack and persist withdrawal + transaction status. */
export const syncWithdrawalFromPaystack = async (
  withdrawal: IWithdrawal
): Promise<IWithdrawal> => {
  const transactionBefore = await Transaction.findOne({ reference: withdrawal.reference });

  log.info("Sync started", {
    withdrawalId: withdrawal._id.toString(),
    reference: withdrawal.reference,
    transferCode: withdrawal.paystackTransferCode || null,
    withdrawalStatus: withdrawal.status,
    transactionStatus: transactionBefore?.status || "NOT_FOUND",
    transactionType: transactionBefore?.type || null,
    paystackConfigured: paystackService.isConfigured(),
  });

  if (withdrawal.status === "COMPLETED" || withdrawal.status === "FAILED") {
    log.debug("Sync skipped  withdrawal already terminal", {
      reference: withdrawal.reference,
      status: withdrawal.status,
    });
    return withdrawal;
  }

  try {
    const resolved = await paystackService.resolveTransferStatus(
      withdrawal.reference,
      withdrawal.paystackTransferCode
    );

    if (!resolved?.status) {
      log.warn("Paystack returned no transfer status yet", {
        reference: withdrawal.reference,
        transferCode: withdrawal.paystackTransferCode || null,
      });
      return withdrawal;
    }

    const paystackStatus = resolved.status.toLowerCase();
    log.info("Paystack transfer status resolved", {
      reference: withdrawal.reference,
      paystackStatus,
      paystackReference: resolved.reference,
      paystackAmount: resolved.amount,
    });

    if (TERMINAL_SUCCESS.has(paystackStatus)) {
      withdrawal.status = "COMPLETED";
      const txResult = await Transaction.updateOne(
        { reference: withdrawal.reference },
        { status: "COMPLETED" }
      );
      await withdrawal.save();

      log.info("Withdrawal marked COMPLETED", {
        reference: withdrawal.reference,
        paystackStatus,
        transactionMatched: txResult.matchedCount,
        transactionModified: txResult.modifiedCount,
      });

      if (txResult.matchedCount === 0) {
        log.error("Transaction record not found for COMPLETED update", {
          reference: withdrawal.reference,
        });
      }

      return withdrawal;
    }

    if (TERMINAL_FAILURE.has(paystackStatus)) {
      const transaction = await Transaction.findOne({ reference: withdrawal.reference });
      const shouldRefund = transaction?.status === "PENDING";

      withdrawal.status = "FAILED";
      const txResult = await Transaction.updateOne(
        { reference: withdrawal.reference },
        { status: "FAILED" }
      );
      await withdrawal.save();

      if (shouldRefund) {
        await restoreWalletOnFailedWithdrawal(withdrawal);
        log.info("Wallet refunded after failed transfer", {
          reference: withdrawal.reference,
          amount: withdrawal.amount,
        });
      }

      log.info("Withdrawal marked FAILED", {
        reference: withdrawal.reference,
        paystackStatus,
        transactionMatched: txResult.matchedCount,
        transactionModified: txResult.modifiedCount,
        refunded: shouldRefund,
      });

      return withdrawal;
    }

    // Paystack still processing (pending, processing, otp, etc.)
    log.info("Transfer still in progress on Paystack", {
      reference: withdrawal.reference,
      paystackStatus,
      withdrawalStatus: withdrawal.status,
    });

    if (withdrawal.status === "PENDING") {
      withdrawal.status = "PROCESSING";
      await withdrawal.save();
      log.debug("Withdrawal promoted PENDING → PROCESSING", {
        reference: withdrawal.reference,
      });
    }
  } catch (err) {
    const axiosErr = err as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    log.error("Paystack withdrawal sync error", {
      reference: withdrawal.reference,
      message: axiosErr.message,
      httpStatus: axiosErr.response?.status,
      responseData: axiosErr.response?.data,
    });
  }

  const transactionAfter = await Transaction.findOne({ reference: withdrawal.reference });
  log.info("Sync finished", {
    reference: withdrawal.reference,
    withdrawalStatus: withdrawal.status,
    transactionStatus: transactionAfter?.status || "NOT_FOUND",
  });

  return withdrawal;
};

export const syncPendingWithdrawalsForUser = async (userId: string) => {
  const pending = await Withdrawal.find({
    userId,
    status: { $in: ["PENDING", "PROCESSING"] },
  });

  log.info("Syncing pending withdrawals for user", {
    userId,
    count: pending.length,
    references: pending.map((w) => w.reference),
  });

  await Promise.all(pending.map((w) => syncWithdrawalFromPaystack(w)));
};

export const syncWithdrawalByReference = async (reference: string) => {
  log.info("Sync by reference requested", { reference });
  const withdrawal = await Withdrawal.findOne({ reference });
  if (!withdrawal) {
    log.warn("No withdrawal found for reference", { reference });
    return null;
  }
  return syncWithdrawalFromPaystack(withdrawal);
};
