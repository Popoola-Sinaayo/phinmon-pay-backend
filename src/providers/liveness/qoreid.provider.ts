import { v4 as uuidv4 } from "uuid";
import config from "../../config";
import { qoreIdClient } from "../qoreid/qoreid.client";
import { VerificationSession } from "../../modules/verification/verificationSession.model";
import {
  LivenessProvider,
  LivenessStartResult,
  LivenessStartOptions,
  LivenessCompletePayload,
  LivenessResult,
} from "./types";

export class QoreIdLivenessProvider implements LivenessProvider {
  async startVerification(
    userId: string,
    options?: LivenessStartOptions
  ): Promise<LivenessStartResult> {
    if (!qoreIdClient.isConfigured()) {
      throw new Error("QoreID is not configured");
    }

    if (!options?.idNumber) {
      throw new Error("NIN idNumber is required for NIN liveness verification");
    }

    const productCode = config().QOREID_NIN_LIVENESS_PRODUCT_CODE;
    const reference = `nin-liveness-${uuidv4()}`;
    const session = await qoreIdClient.mintSessionToken({
      productCode,
      reference,
      subjectRef: userId,
    });

    const expiresAt = session.expiresAt
      ? new Date(session.expiresAt)
      : new Date(Date.now() + 5 * 60 * 1000);

    await VerificationSession.create({
      userId,
      type: "nin_liveness",
      sessionId: session.sessionId,
      reference,
      expiresAt,
    });

    return {
      sessionId: session.sessionId,
      sdkSessionToken: session.sdkSessionToken,
      customerReference: reference,
      // Raw NIN is used server-side only; never returned to the browser.
    };
  }

  async completeVerification(payload: LivenessCompletePayload): Promise<LivenessResult> {
    const record = await VerificationSession.findOne({
      sessionId: payload.sessionId,
      userId: payload.userId,
      type: "nin_liveness",
      completed: false,
    });

    if (!record) {
      return { success: false, message: "Invalid or expired liveness session" };
    }

    if (record.expiresAt.getTime() < Date.now()) {
      return { success: false, message: "Liveness session has expired" };
    }

    record.completed = true;
    await record.save();

    return { success: true, message: "NIN liveness verified via QoreID" };
  }
}
