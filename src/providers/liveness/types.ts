export interface LivenessStartOptions {
  idNumber?: string;
}

export interface LivenessStartResult {
  sessionId: string;
  sdkSessionToken?: string;
  customerReference?: string;
  redirectUrl?: string;
  idNumber?: string;
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
  startVerification(userId: string, options?: LivenessStartOptions): Promise<LivenessStartResult>;
  completeVerification(payload: LivenessCompletePayload): Promise<LivenessResult>;
}
