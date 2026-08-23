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
  middleName?: string;
  dateOfBirth?: string;
  gender?: string;
  phone?: string;
  email?: string;
  photo?: string;
  providerId?: number;
  message?: string;
  /** Provider/billing outage — not a user NIN problem */
  providerUnavailable?: boolean;
}

export interface NINProvider {
  verifyNIN(payload: NINVerifyPayload): Promise<NINResult>;
}
