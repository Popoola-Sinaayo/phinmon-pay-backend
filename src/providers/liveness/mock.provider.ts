import { v4 as uuidv4 } from "uuid";
import { LivenessProvider, LivenessStartResult, LivenessCompletePayload, LivenessResult } from "./types";

const sessions = new Map<string, { userId: string; completed: boolean }>();

export class MockLivenessProvider implements LivenessProvider {
  async startVerification(userId: string): Promise<LivenessStartResult> {
    const sessionId = uuidv4();
    sessions.set(sessionId, { userId, completed: false });
    return { sessionId, redirectUrl: `/verification/liveness?session=${sessionId}` };
  }

  async completeVerification(payload: LivenessCompletePayload): Promise<LivenessResult> {
    const session = sessions.get(payload.sessionId);
    if (!session || session.userId !== payload.userId) {
      return { success: false, message: "Invalid liveness session" };
    }
    session.completed = true;
    return { success: true, message: "Liveness verified successfully (mock)" };
  }
}
