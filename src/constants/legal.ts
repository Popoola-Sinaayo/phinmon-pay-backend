/** Bump when Terms of Service or Privacy Policy material content changes. */
export const CURRENT_TERMS_VERSION = "2026-07-21";

export function needsTermsAcceptance(termsVersion?: string | null): boolean {
  return !termsVersion || termsVersion !== CURRENT_TERMS_VERSION;
}
