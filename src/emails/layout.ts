const BRAND = {
  name: "Phinmon",
  primary: "#107a4c",
  primaryDark: "#0e6340",
  primaryLight: "#eefaf2",
  text: "#1a1a1a",
  textMuted: "#5c6370",
  border: "#e8ebe6",
  background: "#f4f6f2",
  white: "#ffffff",
};

export type EmailLayoutOptions = {
  preheader?: string;
  title: string;
  bodyHtml: string;
  footerNote?: string;
};

export const formatNaira = (amount: number): string =>
  `₦${Math.round(amount).toLocaleString("en-NG")}`;

/** Responsive, table-based layout for broad email client support. */
export const renderEmailLayout = (options: EmailLayoutOptions): string => {
  const preheader = options.preheader || "";
  const footerNote =
    options.footerNote ||
    `You're receiving this because you have a verified ${BRAND.name} account.`;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-padding { padding-left: 20px !important; padding-right: 20px !important; }
      .stat-cell { display: block !important; width: 100% !important; padding: 8px 0 !important; }
      .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0;text-align:center;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <div style="display:inline-block;background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primaryDark} 100%);border-radius:12px;padding:12px 24px;">
                      <span style="font-size:22px;font-weight:700;color:${BRAND.white};letter-spacing:-0.5px;">${BRAND.name}</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:${BRAND.white};border-radius:16px;border:1px solid ${BRAND.border};overflow:hidden;box-shadow:0 4px 24px rgba(16,122,76,0.08);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="email-padding" style="padding:40px 40px 32px 40px;">
                    ${options.bodyHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 16px 0 16px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;line-height:20px;color:${BRAND.textMuted};">${footerNote}</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${BRAND.name}. Earn from verified surveys.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

export const renderCtaButton = (href: string, label: string): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0 auto;">
    <tr>
      <td align="center" style="border-radius:10px;background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primaryDark} 100%);">
        <a href="${escapeAttr(href)}" class="cta-button" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:${BRAND.white};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;

export const renderStatRow = (
  stats: Array<{ label: string; value: string; highlight?: boolean }>
): string => {
  const cells = stats
    .map(
      (stat) => `
    <td class="stat-cell" align="center" style="padding:0 8px;width:${Math.floor(100 / stats.length)}%;">
      <div style="background-color:${stat.highlight ? BRAND.primaryLight : "#f8faf8"};border-radius:12px;padding:16px 12px;border:1px solid ${stat.highlight ? "#c6e9d4" : BRAND.border};">
        <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND.textMuted};">${escapeHtml(stat.label)}</p>
        <p style="margin:0;font-size:20px;font-weight:700;color:${stat.highlight ? BRAND.primary : BRAND.text};">${escapeHtml(stat.value)}</p>
      </div>
    </td>`
    )
    .join("");

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
    <tr>${cells}</tr>
  </table>`;
};

export type PremiumEmailOptions = {
  preheader: string;
  title: string;
  recipientName?: string;
  headline: string;
  messageHtml: string;
  ctaHref?: string;
  ctaLabel?: string;
  footerNote?: string;
};

/** Full-width broadcast layout — no nested card squeeze; tuned for mobile + desktop clients. */
export const renderPremiumBroadcastEmail = (options: PremiumEmailOptions): string => {
  const greeting = options.recipientName
    ? `Hi ${escapeHtml(options.recipientName)},`
    : "Hi there,";
  const footerNote =
    options.footerNote ||
    "You're receiving this because you have a Phinmon account. We only email you about the platform.";

  const ctaBlock =
    options.ctaHref && options.ctaLabel
      ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:40px 0 0 0;">
            <tr>
              <td align="center">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};border-radius:14px;">
                      <a href="${escapeAttr(options.ctaHref)}" class="cta-button" style="display:inline-block;padding:18px 48px;font-size:18px;font-weight:700;color:${BRAND.white};text-decoration:none;border-radius:14px;line-height:1.2;min-width:200px;text-align:center;">${escapeHtml(options.ctaLabel)}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(options.title)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media only screen and (max-width: 680px) {
      .broadcast-container { width: 100% !important; max-width: 100% !important; }
      .broadcast-hero { padding: 40px 28px !important; }
      .broadcast-body { padding: 36px 24px 40px 24px !important; }
      .broadcast-headline { font-size: 30px !important; line-height: 1.25 !important; }
      .broadcast-message { padding: 28px 24px !important; font-size: 17px !important; line-height: 1.65 !important; }
      .cta-button { display: block !important; width: 100% !important; box-sizing: border-box !important; padding: 18px 24px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BRAND.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(options.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" class="broadcast-container" width="640" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;width:100%;">
          <!-- Hero -->
          <tr>
            <td class="broadcast-hero" bgcolor="${BRAND.primary}" style="background-color:${BRAND.primary};background:linear-gradient(135deg,${BRAND.primary} 0%,${BRAND.primaryDark} 100%);border-radius:20px 20px 0 0;padding:48px 48px 52px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 16px 0;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:rgba(255,255,255,0.88);">Phinmon</p>
                    <p style="margin:0 0 12px 0;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.75);">Message for you</p>
                    <h1 class="broadcast-headline" style="margin:0;font-size:36px;font-weight:800;color:${BRAND.white};line-height:1.2;letter-spacing:-0.6px;">${escapeHtml(options.headline)}</h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="broadcast-body" style="background-color:${BRAND.white};border-radius:0 0 20px 20px;border:1px solid ${BRAND.border};border-top:none;padding:44px 48px 48px 48px;">
              <p style="margin:0 0 28px 0;font-size:18px;line-height:28px;color:${BRAND.textMuted};">${greeting}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="broadcast-message" bgcolor="#f8fbf9" style="background-color:#f8fbf9;border:1px solid #dceee3;border-left:5px solid ${BRAND.primary};border-radius:16px;padding:32px 36px;font-size:18px;line-height:32px;color:${BRAND.text};">
                    ${options.messageHtml}
                  </td>
                </tr>
              </table>
              ${ctaBlock}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:44px;">
                <tr>
                  <td style="border-top:1px solid ${BRAND.border};padding-top:28px;">
                    <p style="margin:0 0 6px 0;font-size:16px;font-weight:700;color:${BRAND.text};">The Phinmon team</p>
                    <p style="margin:0;font-size:15px;line-height:24px;color:${BRAND.textMuted};">Nigeria&apos;s verified insights marketplace</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:28px 16px 0 16px;text-align:center;">
              <p style="margin:0 0 10px 0;font-size:14px;line-height:22px;color:${BRAND.textMuted};">${footerNote}</p>
              <p style="margin:0;font-size:13px;line-height:20px;color:#9ca3af;">&copy; ${new Date().getFullYear()} ${BRAND.name}. Earn from verified surveys.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeAttr = (value: string): string => escapeHtml(value);
