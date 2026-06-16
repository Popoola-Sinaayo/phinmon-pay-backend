import axios from "axios";
import config from "../../config";
import { NINProvider, NINVerifyPayload, NINResult } from "./types";

export class NubanNINProvider implements NINProvider {
  async verifyNIN(payload: NINVerifyPayload): Promise<NINResult> {
    const cfg = config();
    if (!cfg.NUBAN_API_KEY) {
      throw new Error("NUBAN_API_KEY is required for Nuban NIN provider");
    }

    try {
      const response = await axios.post(
        `${cfg.NUBAN_API_URL}/nin/verify`,
        { nin: payload.nin },
        {
          headers: {
            Authorization: `Bearer ${cfg.NUBAN_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const data = response.data?.data || response.data;
      if (data?.verified || data?.status === "success") {
        return {
          success: true,
          firstName: data.first_name || data.firstName,
          lastName: data.last_name || data.lastName,
          dateOfBirth: data.date_of_birth || data.dateOfBirth || data.dob,
          message: "NIN verified successfully",
        };
      }
      return { success: false, message: data?.message || "NIN verification failed" };
    } catch (error: unknown) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.message
          ? String(error.response.data.message)
          : "NIN verification service unavailable";
      return { success: false, message };
    }
  }
}
