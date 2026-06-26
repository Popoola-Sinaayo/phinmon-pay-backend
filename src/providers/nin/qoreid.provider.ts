import { qoreIdClient } from "../qoreid/qoreid.client";
import { splitFullName } from "../../utils/ninMatching";
import { NINProvider, NINVerifyPayload, NINResult } from "./types";

function parseQoreIdBirthdate(birthdate?: string): string | undefined {
  if (!birthdate) return undefined;
  const ddMmYyyy = birthdate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyyy) {
    return `${ddMmYyyy[3]}-${ddMmYyyy[2]}-${ddMmYyyy[1]}`;
  }
  const parsed = new Date(birthdate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().split("T")[0];
  }
  return undefined;
}

export class QoreIdNINProvider implements NINProvider {
  async verifyNIN(payload: NINVerifyPayload): Promise<NINResult> {
    if (!qoreIdClient.isConfigured()) {
      return { success: false, message: "QoreID is not configured" };
    }

    if (payload.nin.length !== 11 || !/^\d+$/.test(payload.nin)) {
      return { success: false, message: "Invalid NIN format. Must be 11 digits." };
    }

    const { firstName, lastName } = splitFullName(payload.registeredName || "");

    try {
      const data = await qoreIdClient.verifyNin(payload.nin, {
        firstname: firstName,
        lastname: lastName,
        dob: payload.registeredDob,
      });

      if (data.status?.status && data.status.status !== "verified") {
        return {
          success: false,
          message: data.message || "NIN verification failed",
        };
      }

      const ninData = data.nin;
      if (!ninData?.firstname && !ninData?.lastname) {
        return { success: false, message: "NIN not found in national registry." };
      }

      return {
        success: true,
        firstName: ninData.firstname,
        lastName: ninData.lastname,
        middleName: ninData.middlename,
        dateOfBirth: parseQoreIdBirthdate(ninData.birthdate),
        gender: ninData.gender,
        phone: ninData.phone,
        email: ninData.email,
        photo: ninData.photo,
        providerId: data.id,
        message: "NIN verified via QoreID",
      };
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "NIN verification failed";
      return { success: false, message };
    }
  }
}
