export interface NINVerifyPayload {
  nin: string;
  userId: string;
}

export interface NINResult {
  success: boolean;
  firstName?: string;
  lastName?: string;
  message?: string;
}

export interface NINProvider {
  verifyNIN(payload: NINVerifyPayload): Promise<NINResult>;
}
