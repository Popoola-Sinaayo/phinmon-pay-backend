import { hashPin, isValidPinFormat, verifyPin } from "../pin";

describe("isValidPinFormat", () => {
  it("accepts 4–6 digit pins", () => {
    expect(isValidPinFormat("1234")).toBe(true);
    expect(isValidPinFormat("123456")).toBe(true);
  });

  it("rejects invalid pins", () => {
    expect(isValidPinFormat("123")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12ab")).toBe(false);
  });
});

describe("hashPin / verifyPin", () => {
  it("verifies a hashed pin", async () => {
    const hash = await hashPin("4321");
    expect(await verifyPin("4321", hash)).toBe(true);
    expect(await verifyPin("9999", hash)).toBe(false);
  });
});
