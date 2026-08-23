/** User-facing copy when identity provider is down / out of credit. */
export const PROVIDER_TEMP_UNAVAILABLE_MESSAGE =
  "Verification is temporarily unavailable. Please try again later.";

/**
 * Detect QoreID (or similar) billing / wallet failures so we never surface
 * "insufficient funds" style copy to end users.
 */
export const isProviderBillingError = (errOrMessage: unknown): boolean => {
  const parts: string[] = [];

  if (typeof errOrMessage === "string") {
    parts.push(errOrMessage);
  } else if (errOrMessage && typeof errOrMessage === "object") {
    const err = errOrMessage as {
      message?: string;
      response?: { data?: unknown };
    };
    if (err.message) parts.push(String(err.message));
    const data = err.response?.data;
    if (typeof data === "string") {
      parts.push(data);
    } else if (data && typeof data === "object") {
      const d = data as Record<string, unknown>;
      for (const key of ["message", "error", "error_description", "detail", "title"]) {
        if (d[key] != null) parts.push(String(d[key]));
      }
    }
  }

  const text = parts.join(" ").toLowerCase();
  if (!text) return false;

  return (
    text.includes("insufficient fund") ||
    text.includes("insufficient_funds") ||
    text.includes("out of credit") ||
    text.includes("no credit") ||
    text.includes("low balance") ||
    text.includes("wallet balance") ||
    text.includes("not enough credit") ||
    text.includes("credit exhausted") ||
    (text.includes("insufficient") && text.includes("fund"))
  );
};

export const sanitizeProviderErrorMessage = (message?: string): string => {
  if (!message || isProviderBillingError(message)) {
    return PROVIDER_TEMP_UNAVAILABLE_MESSAGE;
  }
  return message;
};
