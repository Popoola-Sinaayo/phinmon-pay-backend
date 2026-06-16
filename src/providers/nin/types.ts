export interface NINVerifyPayload {
  nin: string;
  userId: string;
  /** Used by mock provider to simulate registry data */
  registeredName?: string;
  registeredDob?: string;
}

export interface NINResult {
  success: boolean;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  message?: string;
}

export interface NINProvider {
  verifyNIN(payload: NINVerifyPayload): Promise<NINResult>;
}
