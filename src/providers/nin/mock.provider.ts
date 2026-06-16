import { splitFullName } from "../../utils/ninMatching";
import { NINProvider, NINVerifyPayload, NINResult } from "./types";

/** NIN that simulates registry mismatch (wrong identity returned) */
const MISMATCH_NIN = "11111111111";

export class MockNINProvider implements NINProvider {
  async verifyNIN(payload: NINVerifyPayload): Promise<NINResult> {
    if (payload.nin.length !== 11 || !/^\d+$/.test(payload.nin)) {
      return { success: false, message: "Invalid NIN format. Must be 11 digits." };
    }
    if (payload.nin === "00000000000") {
      return { success: false, message: "NIN not found in national registry." };
    }

    if (payload.nin === MISMATCH_NIN) {
      return {
        success: true,
        firstName: "Different",
        lastName: "Person",
        dateOfBirth: "1990-01-01",
        message: "NIN found (mock mismatch test)",
      };
    }

    if (payload.registeredName && payload.registeredDob) {
      const { firstName, lastName } = splitFullName(payload.registeredName);
      return {
        success: true,
        firstName,
        lastName,
        dateOfBirth: payload.registeredDob,
        message: "NIN verified successfully (mock)",
      };
    }

    return {
      success: true,
      firstName: "Test",
      lastName: "User",
      dateOfBirth: "1995-01-01",
      message: "NIN verified successfully (mock)",
    };
  }
}
