import { encryptJSON, decryptJSON, encryptNIN, decryptNIN, hashValue } from "../encryption";

describe("encryption", () => {
  it("round-trips JSON payloads", () => {
    const payload = { firstname: "Ada", lastname: "Lovelace", verifiedAt: "2026-01-01" };
    const encrypted = encryptJSON(payload);
    expect(decryptJSON<typeof payload>(encrypted)).toEqual(payload);
  });

  it("round-trips NIN values", () => {
    const nin = "12345678901";
    expect(decryptNIN(encryptNIN(nin))).toBe(nin);
  });

  it("hashes values deterministically", () => {
    expect(hashValue("12345678901")).toBe(hashValue("12345678901"));
    expect(hashValue("12345678901")).not.toBe(hashValue("10987654321"));
  });
});
