import nodemailer from "nodemailer";
import config from "../../config";
import { EmailProvider, EmailPayload } from "./types";

export class SmtpEmailProvider implements EmailProvider {
  private transporter = nodemailer.createTransport({
    host: config().SMTP_HOST,
    port: config().SMTP_PORT,
    secure: false,
    auth: {
      user: config().SMTP_USER,
      pass: config().SMTP_PASS,
    },
  });

  async send(payload: EmailPayload): Promise<void> {
    await this.transporter.sendMail({
      from: config().EMAIL_FROM,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
    });
  }
}
