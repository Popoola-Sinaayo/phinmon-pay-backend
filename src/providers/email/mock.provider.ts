import { EmailProvider, EmailPayload } from "./types";

export class MockEmailProvider implements EmailProvider {
  async send(payload: EmailPayload): Promise<void> {
    console.log(`[MockEmail] To: ${payload.to} | Subject: ${payload.subject}`);
  }
}
