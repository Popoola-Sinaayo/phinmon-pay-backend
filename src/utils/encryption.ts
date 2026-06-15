import crypto from "crypto";
import config from "../config";

const ALGORITHM = "aes-256-gcm";

export const encryptNIN = (nin: string): string => {
  const key = crypto.scryptSync(config().NIN_ENCRYPTION_KEY, "salt", 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(nin, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
};

export const decryptNIN = (encrypted: string): string => {
  const [ivHex, authTagHex, encryptedData] = encrypted.split(":");
  const key = crypto.scryptSync(config().NIN_ENCRYPTION_KEY, "salt", 32);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

export const hashValue = (value: string): string => {
  return crypto.createHash("sha256").update(value).digest("hex");
};
