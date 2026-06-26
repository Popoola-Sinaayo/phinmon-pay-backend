import dotenv from "dotenv";

dotenv.config();

const config = () => ({
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT || "4000", 10),
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/insightpay",
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || "mock",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseInt(process.env.SMTP_PORT || "587", 10),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  EMAIL_FROM: process.env.EMAIL_FROM || "noreply@insightpay.ng",
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || "",
  PAYSTACK_PUBLIC_KEY: process.env.PAYSTACK_PUBLIC_KEY || "",
  PAYSTACK_WEBHOOK_SECRET: process.env.PAYSTACK_WEBHOOK_SECRET || "",
  NIN_PROVIDER: process.env.NIN_PROVIDER || "qoreid",
  NUBAN_API_KEY: process.env.NUBAN_API_KEY || "",
  NUBAN_API_URL: process.env.NUBAN_API_URL || "https://api.nuban.com.ng/v1",
  QOREID_CLIENT_ID: process.env.QOREID_CLIENT_ID || "",
  QOREID_SECRET: process.env.QOREID_SECRET || "",
  QOREID_API_URL: process.env.QOREID_API_URL || "https://api.qoreid.com",
  QOREID_NIN_LIVENESS_PRODUCT_CODE:
    process.env.QOREID_NIN_LIVENESS_PRODUCT_CODE || "liveness_nin",
  NIN_ENCRYPTION_KEY: process.env.NIN_ENCRYPTION_KEY || "32-char-secret-key-change-me!!",
  FEATURE_LIVENESS: process.env.FEATURE_LIVENESS === "true",
  LIVENESS_PROVIDER: process.env.LIVENESS_PROVIDER || "qoreid",
  PLATFORM_FEE_PERCENT: parseFloat(process.env.PLATFORM_FEE_PERCENT || "25"),
  MIN_WITHDRAWAL_AMOUNT: parseFloat(process.env.MIN_WITHDRAWAL_AMOUNT || "1000"),
  AUTO_APPROVE_RESPONSES: process.env.AUTO_APPROVE_RESPONSES !== "false",
  FEATURE_TIME_BASED_PRICING: process.env.FEATURE_TIME_BASED_PRICING !== "false",
  FEATURE_PREMIUM_MULTIPLIER: process.env.FEATURE_PREMIUM_MULTIPLIER !== "false",
});

export type AppConfig = ReturnType<typeof config>;
export default config;
