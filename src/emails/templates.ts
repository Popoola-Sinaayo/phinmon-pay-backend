import config from "../config";
import {
  formatNaira,
  renderCtaButton,
  renderEmailLayout,
  renderStatRow,
} from "./layout";

export const otpEmailTemplate = (code: string): string => {
  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3;">Your sign-in code</h1>
    <p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:#5c6370;">
      Enter this code to sign in to your Phinmon account. It expires in <strong style="color:#1a1a1a;">10 minutes</strong>.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="background-color:#eefaf2;border:2px dashed #a8e4bf;border-radius:12px;padding:24px;">
          <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#107a4c;font-family:'Courier New',Courier,monospace;">${code}</span>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 0 0;font-size:14px;line-height:22px;color:#9ca3af;">
      If you didn't request this code, you can safely ignore this email.
    </p>`;

  return renderEmailLayout({
    preheader: `Your Phinmon sign-in code is ${code}`,
    title: "Your sign-in code",
    bodyHtml,
  });
};

export const welcomeEmailTemplate = (name: string): string => {
  const greeting = name ? `Welcome, ${name}!` : "Welcome to Phinmon!";
  const dashboardUrl = `${config().FRONTEND_URL}/dashboard`;

  const bodyHtml = `
    <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:700;color:#1a1a1a;line-height:1.3;">${greeting}</h1>
    <p style="margin:0 0 16px 0;font-size:16px;line-height:26px;color:#5c6370;">
      You're in. Complete your identity verification, then start earning from verified surveys — or launch your first research campaign.
    </p>
    ${renderStatRow([
      { label: "Verify", value: "NIN + selfie", highlight: false },
      { label: "Earn", value: "Per survey", highlight: true },
      { label: "Paid", value: "To wallet", highlight: false },
    ])}
    ${renderCtaButton(dashboardUrl, "Go to dashboard")}`;

  return renderEmailLayout({
    preheader: "Your Phinmon account is ready — verify and start earning.",
    title: "Welcome to Phinmon",
    bodyHtml,
  });
};

export type NewSurveyEmailParams = {
  recipientName?: string;
  surveyTitle: string;
  surveyDescription: string;
  surveyUrl: string;
  payoutAmount: number;
  estimatedMinutes: number;
  questionCount: number;
  isPremium: boolean;
  category?: string;
};

export const newSurveyEmailTemplate = (params: NewSurveyEmailParams): string => {
  const greeting = params.recipientName
    ? `Hi ${params.recipientName},`
    : "Hi there,";
  const description =
    params.surveyDescription.length > 180
      ? `${params.surveyDescription.slice(0, 177)}…`
      : params.surveyDescription;

  const premiumBadge = params.isPremium
    ? `<span style="display:inline-block;background-color:#fef3c7;color:#92400e;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;padding:4px 10px;border-radius:20px;margin-bottom:12px;">Premium survey</span>`
    : "";

  const categoryLine = params.category
    ? `<p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#107a4c;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(params.category)}</p>`
    : "";

  const bodyHtml = `
    ${premiumBadge}
    <p style="margin:0 0 4px 0;font-size:15px;color:#5c6370;">${greeting}</p>
    <h1 style="margin:0 0 12px 0;font-size:26px;font-weight:700;color:#1a1a1a;line-height:1.25;">A new survey is waiting for you</h1>
    ${categoryLine}
    <p style="margin:0 0 4px 0;font-size:18px;font-weight:600;color:#1a1a1a;line-height:1.4;">${escapeHtml(params.surveyTitle)}</p>
    <p style="margin:0;font-size:15px;line-height:24px;color:#5c6370;">${escapeHtml(description)}</p>
    ${renderStatRow([
      { label: "You earn", value: formatNaira(params.payoutAmount), highlight: true },
      { label: "Time", value: `~${params.estimatedMinutes} min` },
      { label: "Questions", value: String(params.questionCount) },
    ])}
    ${renderCtaButton(params.surveyUrl, "View survey & start")}
    <p style="margin:24px 0 0 0;font-size:13px;line-height:20px;color:#9ca3af;text-align:center;">
      Spots are limited — complete it before slots fill up.
    </p>`;

  return renderEmailLayout({
    preheader: `Earn ${formatNaira(params.payoutAmount)} — ${params.surveyTitle}`,
    title: `New survey: ${params.surveyTitle}`,
    bodyHtml,
    footerNote:
      "You're receiving this because you're eligible for surveys on Phinmon. We'll only email you when new surveys match your verification level.",
  });
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
