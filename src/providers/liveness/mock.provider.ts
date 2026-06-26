import { v4 as uuidv4 } from "uuid";
import { LivenessProvider, LivenessStartResult, LivenessStartOptions, LivenessCompletePayload, LivenessResult } from "./types";

const sessions = new Map<string, { userId: string; completed: boolean; type: "liveness" | "nin_liveness" }>();

export class MockLivenessProvider implements LivenessProvider {
  async startVerification(userId: string, options?: LivenessStartOptions): Promise<LivenessStartResult> {
    const sessionId = uuidv4();
    const type = options?.idNumber ? "nin_liveness" : "liveness";
    sessions.set(sessionId, { userId, completed: false, type });
    return {
      sessionId,
      redirectUrl: `/verification/liveness?session=${sessionId}`,
      idNumber: options?.idNumber,
      customerReference: `mock-${sessionId}`,
    };
  }

  async completeVerification(payload: LivenessCompletePayload): Promise<LivenessResult> {
    const session = sessions.get(payload.sessionId);
    if (!session || session.userId !== payload.userId) {
      return { success: false, message: "Invalid liveness session" };
    }
    session.completed = true;
    return {
      success: true,
      message:
        session.type === "nin_liveness"
          ? "NIN liveness verified successfully (mock)"
          : "Liveness verified successfully (mock)",
    };
  }
}
