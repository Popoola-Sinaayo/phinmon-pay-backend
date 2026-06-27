import axios from "axios";
import config from "../../config";

export interface PaystackInitResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

export interface PaystackVerifyResult {
  success: boolean;
  amount: number;
  reference: string;
  authorization?: {
    authorizationCode: string;
    reusable: boolean;
    cardType: string;
    last4: string;
    expMonth: string;
    expYear: string;
    bank: string;
  };
}

export interface PaystackChargeResult {
  success: boolean;
  reference: string;
  message?: string;
}

export interface BankResolveResult {
  accountName: string;
  accountNumber: string;
  bankId: number;
}

export interface TransferRecipientResult {
  recipientCode: string;
}

export interface TransferResult {
  transferCode: string;
  status: string;
}

export class PaystackService {
  private baseUrl = "https://api.paystack.co";
  private secretKey: string;

  constructor() {
    this.secretKey = config().PAYSTACK_SECRET_KEY;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
    };
  }

  isConfigured(): boolean {
    return !!this.secretKey;
  }

  async initializeTransaction(params: {
    email: string;
    amount: number;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackInitResult> {
    if (!this.isConfigured()) {
      return {
        authorizationUrl: `${params.callbackUrl}?reference=${params.reference}&mock=true`,
        accessCode: "mock_access_code",
        reference: params.reference,
      };
    }

    const response = await axios.post(
      `${this.baseUrl}/transaction/initialize`,
      {
        email: params.email,
        amount: Math.round(params.amount * 100),
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      },
      { headers: this.headers }
    );

    const data = response.data.data;
    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  async chargeAuthorization(params: {
    authorizationCode: string;
    email: string;
    amount: number;
    reference: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackChargeResult> {
    if (!this.isConfigured()) {
      return { success: true, reference: params.reference };
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/transaction/charge_authorization`,
        {
          authorization_code: params.authorizationCode,
          email: params.email,
          amount: Math.round(params.amount * 100),
          reference: params.reference,
          metadata: params.metadata,
        },
        { headers: this.headers }
      );

      const data = response.data.data;
      return {
        success: data.status === "success",
        reference: data.reference,
        message: response.data.message,
      };
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Charge failed";
      return { success: false, reference: params.reference, message };
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResult> {
    if (!this.isConfigured()) {
      return { success: true, amount: 0, reference };
    }

    const response = await axios.get(`${this.baseUrl}/transaction/verify/${reference}`, {
      headers: this.headers,
    });

    const data = response.data.data;
    const auth = data.authorization;
    return {
      success: data.status === "success",
      amount: data.amount / 100,
      reference: data.reference,
      authorization: auth
        ? {
            authorizationCode: auth.authorization_code,
            reusable: auth.reusable === true,
            cardType: auth.card_type || "card",
            last4: auth.last4 || "0000",
            expMonth: String(auth.exp_month || ""),
            expYear: String(auth.exp_year || ""),
            bank: auth.bank || "",
          }
        : undefined,
    };
  }

  async resolveAccount(accountNumber: string, bankCode: string): Promise<BankResolveResult> {
    if (!this.isConfigured()) {
      return {
        accountName: "Mock Account Name",
        accountNumber,
        bankId: 1,
      };
    }

    const response = await axios.get(
      `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
      { headers: this.headers }
    );

    const data = response.data.data;
    return {
      accountName: data.account_name,
      accountNumber: data.account_number,
      bankId: data.bank_id,
    };
  }

  async createTransferRecipient(params: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<TransferRecipientResult> {
    if (!this.isConfigured()) {
      return { recipientCode: `RCP_mock_${params.accountNumber}` };
    }

    const response = await axios.post(
      `${this.baseUrl}/transferrecipient`,
      {
        type: "nuban",
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: "NGN",
      },
      { headers: this.headers }
    );

    return { recipientCode: response.data.data.recipient_code };
  }

  async initiateTransfer(params: {
    amount: number;
    recipientCode: string;
    reference: string;
    reason: string;
  }): Promise<TransferResult> {
    if (!this.isConfigured()) {
      return { transferCode: `TRF_mock_${params.reference}`, status: "success" };
    }

    const response = await axios.post(
      `${this.baseUrl}/transfer`,
      {
        source: "balance",
        amount: Math.round(params.amount * 100),
        recipient: params.recipientCode,
        reference: params.reference,
        reason: params.reason,
      },
      { headers: this.headers }
    );

    return {
      transferCode: response.data.data.transfer_code,
      status: response.data.data.status,
    };
  }

  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    const secret = config().PAYSTACK_WEBHOOK_SECRET;
    if (!secret) return config().NODE_ENV === "development";
    const crypto = require("crypto") as typeof import("crypto");
    const hash = crypto.createHmac("sha512", secret).update(payload).digest("hex");
    return hash === signature;
  }

  async listBanks(): Promise<Array<{ name: string; code: string }>> {
    if (!this.isConfigured()) {
      return [
        { name: "Access Bank", code: "044" },
        { name: "GTBank", code: "058" },
        { name: "First Bank", code: "011" },
        { name: "UBA", code: "033" },
        { name: "Zenith Bank", code: "057" },
      ];
    }

    const response = await axios.get(`${this.baseUrl}/bank?country=nigeria`, {
      headers: this.headers,
    });

    return response.data.data.map((b: { name: string; code: string }) => ({
      name: b.name,
      code: b.code,
    }));
  }
}

export const paystackService = new PaystackService();
