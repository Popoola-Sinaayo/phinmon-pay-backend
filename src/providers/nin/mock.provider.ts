import { NINProvider, NINVerifyPayload, NINResult } from "./types";

export class MockNINProvider implements NINProvider {
  async verifyNIN(payload: NINVerifyPayload): Promise<NINResult> {
    if (payload.nin.length !== 11 || !/^\d+$/.test(payload.nin)) {
      return { success: false, message: "Invalid NIN format. Must be 11 digits." };
    }
    if (payload.nin === "00000000000") {
      return { success: false, message: "NIN verification failed" };
    }
    return {
      success: true,
      firstName: "Test",
      lastName: "User",
      message: "NIN verified successfully (mock)",
    };
  }
}
