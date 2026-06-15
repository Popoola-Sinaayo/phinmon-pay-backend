import config from "../../config";
import { MockEmailProvider } from "./mock.provider";
import { SmtpEmailProvider } from "./smtp.provider";
import { EmailProvider } from "./types";

let instance: EmailProvider | null = null;

export const getEmailProvider = (): EmailProvider => {
  if (instance) return instance;

  const cfg = config();
  if (cfg.EMAIL_PROVIDER === "smtp" && cfg.SMTP_HOST && cfg.SMTP_USER) {
    instance = new SmtpEmailProvider();
  } else {
    if (cfg.EMAIL_PROVIDER === "smtp") {
      console.warn("[Email] SMTP not configured, falling back to mock provider");
    }
    instance = new MockEmailProvider();
  }
  return instance;
};
