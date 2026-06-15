export interface LivenessStartResult {
  sessionId: string;
  redirectUrl?: string;
}

export interface LivenessCompletePayload {
  userId: string;
  sessionId: string;
}

export interface LivenessResult {
  success: boolean;
  message?: string;
}

export interface LivenessProvider {
  startVerification(userId: string): Promise<LivenessStartResult>;
  completeVerification(payload: LivenessCompletePayload): Promise<LivenessResult>;
}
