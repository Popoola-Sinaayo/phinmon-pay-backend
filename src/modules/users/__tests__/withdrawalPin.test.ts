import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { User } from "../user.model";
import { getWithdrawalPinStatus, setWithdrawalPin } from "../users.service";
import { verifyPin } from "../../../utils/pin";

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

const makeUser = () =>
  User.create({
    email: `pin-${Date.now()}-${Math.random()}@test.co`,
    role: "respondent",
    ninVerified: true,
    status: "VERIFIED",
  });

const loadHash = async (userId: string) => {
  const user = await User.findById(userId).select("+withdrawalPinHash");
  return user?.withdrawalPinHash;
};

describe("setWithdrawalPin", () => {
  it("sets a first PIN without requiring a current PIN", async () => {
    const user = await makeUser();
    const userId = user._id.toString();

    await expect(getWithdrawalPinStatus(userId)).resolves.toEqual({ pinSet: false });

    const result = await setWithdrawalPin(userId, { pin: "1234", confirmPin: "1234" });

    expect(result).toEqual({ pinSet: true });
    expect(await verifyPin("1234", (await loadHash(userId))!)).toBe(true);
    await expect(getWithdrawalPinStatus(userId)).resolves.toEqual({ pinSet: true });
  });

  it("changes an existing PIN when the current PIN is correct", async () => {
    const user = await makeUser();
    const userId = user._id.toString();
    await setWithdrawalPin(userId, { pin: "1234", confirmPin: "1234" });

    await setWithdrawalPin(userId, {
      pin: "567890",
      confirmPin: "567890",
      currentPin: "1234",
    });

    const hash = (await loadHash(userId))!;
    expect(await verifyPin("567890", hash)).toBe(true);
    expect(await verifyPin("1234", hash)).toBe(false);
  });

  it("rejects a change when the current PIN is missing or wrong", async () => {
    const user = await makeUser();
    const userId = user._id.toString();
    await setWithdrawalPin(userId, { pin: "1234", confirmPin: "1234" });

    await expect(
      setWithdrawalPin(userId, { pin: "4321", confirmPin: "4321" })
    ).rejects.toThrow("Current PIN is required to change your withdrawal PIN");

    await expect(
      setWithdrawalPin(userId, { pin: "4321", confirmPin: "4321", currentPin: "0000" })
    ).rejects.toThrow("Current PIN is incorrect");

    expect(await verifyPin("1234", (await loadHash(userId))!)).toBe(true);
  });

  it("rejects mismatched confirmation and malformed PINs", async () => {
    const user = await makeUser();
    const userId = user._id.toString();

    await expect(
      setWithdrawalPin(userId, { pin: "1234", confirmPin: "4321" })
    ).rejects.toThrow("PIN confirmation does not match");

    await expect(
      setWithdrawalPin(userId, { pin: "12", confirmPin: "12" })
    ).rejects.toThrow("PIN must be 4–6 digits");

    expect(await loadHash(userId)).toBeUndefined();
  });
});
