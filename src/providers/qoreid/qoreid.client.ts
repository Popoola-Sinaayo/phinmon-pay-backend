import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import config from "../../config";
import { createLogger, maskValue } from "../../utils/logger";

const log = createLogger("QoreID");

export interface QoreIdNinData {
  nin?: string;
  firstname?: string;
  lastname?: string;
  middlename?: string;
  phone?: string;
  email?: string;
  gender?: string;
  birthdate?: string;
  photo?: string;
  address?: string;
}

export interface QoreIdNinResponse {
  id?: number;
  applicant?: { firstname?: string; lastname?: string };
  summary?: {
    nin_check?: {
      status?: string;
      fieldMatches?: { firstname?: boolean; lastname?: boolean };
    };
  };
  status?: { state?: string; status?: string };
  nin?: QoreIdNinData;
  message?: string;
}

export interface QoreIdSessionResponse {
  sessionId: string;
  sdkSessionToken: string;
  type?: string;
  productCode?: string;
  expiresAt?: string;
}

interface QoreIdTokenResponse {
  accessToken: string;
  expiresIn?: string;
  tokenType?: string;
}

const summarizeAxiosError = (err: unknown) => {
  const axiosErr = err as {
    response?: { status?: number; data?: unknown };
    message?: string;
  };
  return {
    httpStatus: axiosErr.response?.status,
    responseData: axiosErr.response?.data,
    message: axiosErr.message,
  };
};

/** Parse QoreID's "7200 secs" expiry string into milliseconds; defaults to 2h. */
const parseExpiresInMs = (expiresIn?: string): number => {
  const seconds = parseInt(String(expiresIn || "").trim(), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 7200 * 1000;
};

class QoreIdClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenRequest: Promise<string> | null = null;

  private get baseUrl() {
    return config().QOREID_API_URL;
  }

  /** HTTP Basic credentials  used only for the backend-to-backend session mint endpoint. */
  private get basicAuthHeader() {
    const cfg = config();
    const token = Buffer.from(`${cfg.QOREID_CLIENT_ID}:${cfg.QOREID_SECRET}`).toString("base64");
    return { Authorization: `Basic ${token}` };
  }

  isConfigured(): boolean {
    const cfg = config();
    return !!(cfg.QOREID_CLIENT_ID && cfg.QOREID_SECRET);
  }

  /**
   * Fetch (and cache) an OAuth2 Bearer access token via POST /token.
   * Identity verification endpoints authenticate with this Bearer token, not Basic auth.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (this.tokenRequest) {
      return this.tokenRequest;
    }

    const cfg = config();
    const url = `${this.baseUrl}/token`;
    const start = Date.now();
    log.info("Requesting access token", { endpoint: url });

    this.tokenRequest = axios
      .post<QoreIdTokenResponse>(
        url,
        { clientId: cfg.QOREID_CLIENT_ID, secret: cfg.QOREID_SECRET },
        { headers: { "Content-Type": "application/json" } }
      )
      .then((response) => {
        const { accessToken, expiresIn, tokenType } = response.data;
        if (!accessToken) {
          throw new Error("QoreID /token response did not contain an accessToken");
        }
        // Refresh 60s before actual expiry to avoid edge-of-expiry 401s.
        this.tokenExpiresAt = Date.now() + parseExpiresInMs(expiresIn) - 60_000;
        this.accessToken = accessToken;
        log.info("Access token acquired", {
          endpoint: url,
          durationMs: Date.now() - start,
          tokenType: tokenType || "Bearer",
          expiresIn,
        });
        return accessToken;
      })
      .catch((err) => {
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        log.error("Access token request failed", { endpoint: url, ...summarizeAxiosError(err) });
        throw err;
      })
      .finally(() => {
        this.tokenRequest = null;
      });

    return this.tokenRequest;
  }

  private async bearerAuthHeader(): Promise<{ Authorization: string }> {
    const token = await this.getAccessToken();
    return { Authorization: `Bearer ${token}` };
  }

  async verifyNin(
    idNumber: string,
    payload: {
      firstname: string;
      lastname: string;
      middlename?: string;
      dob?: string;
      phone?: string;
      email?: string;
      gender?: string;
    }
  ): Promise<QoreIdNinResponse> {
    const url = `${this.baseUrl}/v1/ng/identities/nin/${idNumber}`;
    const start = Date.now();
    log.info("NIN verification request", {
      endpoint: url,
      nin: maskValue(idNumber),
      firstname: payload.firstname,
      lastname: payload.lastname,
      dob: payload.dob,
    });

    try {
      const authHeader = await this.bearerAuthHeader();
      const response = await axios.post<QoreIdNinResponse>(url, payload, {
        headers: { ...authHeader, "Content-Type": "application/json" },
      });
      const ninData = response.data?.nin;
      log.info("NIN verification response", {
        endpoint: url,
        durationMs: Date.now() - start,
        httpStatus: response.status,
        verificationStatus: response.data?.status,
        ninCheck: response.data?.summary?.nin_check,
        matchedName: `${ninData?.firstname || ""} ${ninData?.lastname || ""}`.trim(),
        birthdate: ninData?.birthdate,
      });
      return response.data;
    } catch (err: unknown) {
      log.error("NIN verification failed", {
        endpoint: url,
        durationMs: Date.now() - start,
        ...summarizeAxiosError(err),
      });
      throw err;
    }
  }

  async mintSessionToken(params: {
    productCode: string;
    reference?: string;
    subjectRef: string;
    ttlSeconds?: number;
    maxAttempts?: number;
  }): Promise<QoreIdSessionResponse> {
    const url = `${this.baseUrl}/v1/sessions`;
    const reference = params.reference || `phinmon-${uuidv4()}`;
    const start = Date.now();
    log.info("Minting SDK session token", {
      endpoint: url,
      productCode: params.productCode,
      reference,
      subjectRef: params.subjectRef,
    });

    try {
      const response = await axios.post<QoreIdSessionResponse>(
        url,
        {
          productCode: params.productCode,
          reference,
          subjectRef: params.subjectRef,
          ttlSeconds: params.ttlSeconds || 300,
          maxAttempts: params.maxAttempts || 3,
        },
        { headers: { ...this.basicAuthHeader, "Content-Type": "application/json" } }
      );
      log.info("SDK session token minted", {
        endpoint: url,
        durationMs: Date.now() - start,
        httpStatus: response.status,
        sessionId: response.data?.sessionId,
        productCode: response.data?.productCode,
        expiresAt: response.data?.expiresAt,
      });
      return response.data;
    } catch (err: unknown) {
      log.error("SDK session token minting failed", {
        endpoint: url,
        durationMs: Date.now() - start,
        ...summarizeAxiosError(err),
      });
      throw err;
    }
  }
}

export const qoreIdClient = new QoreIdClient();
