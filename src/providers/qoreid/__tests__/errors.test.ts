import {
  isProviderBillingError,
  PROVIDER_TEMP_UNAVAILABLE_MESSAGE,
  sanitizeProviderErrorMessage,
} from "../errors";

describe("qoreid provider error sanitization", () => {
  it("detects insufficient funds variants", () => {
    expect(isProviderBillingError("Insufficient funds")).toBe(true);
    expect(isProviderBillingError("insufficient fund in wallet")).toBe(true);
    expect(isProviderBillingError({ message: "Out of credit" })).toBe(true);
    expect(
      isProviderBillingError({
        response: { data: { message: "Insufficient_funds on account" } },
      })
    ).toBe(true);
  });

  it("does not flag normal verification failures", () => {
    expect(isProviderBillingError("NIN not found in national registry.")).toBe(false);
    expect(isProviderBillingError("Name mismatch")).toBe(false);
  });

  it("sanitizes billing messages for users", () => {
    expect(sanitizeProviderErrorMessage("Insufficient funds")).toBe(
      PROVIDER_TEMP_UNAVAILABLE_MESSAGE
    );
    expect(sanitizeProviderErrorMessage("NIN not found")).toBe("NIN not found");
  });
});
