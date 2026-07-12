import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Survey } from "../../surveys/survey.model";
import { User, IUser } from "../../users/user.model";
import { SurveyResponse } from "../response.model";
import { SurveyReservation } from "../reservation.model";
import { Wallet } from "../../wallets/wallet.model";
import { startSurvey } from "../reservation.service";
import { submitResponse } from "../responses.service";

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
  await Promise.all([
    Survey.deleteMany({}),
    User.deleteMany({}),
    SurveyResponse.deleteMany({}),
    SurveyReservation.deleteMany({}),
    Wallet.deleteMany({}),
  ]);
});

const makeSurvey = (responsesNeeded: number, payout = 100) =>
  Survey.create({
    title: "Concurrency Test",
    description: "d",
    researcherId: new mongoose.Types.ObjectId(),
    targetAudience: "ALL_VERIFIED",
    payoutPerResponse: payout,
    responsesNeeded,
    budget: responsesNeeded * payout,
    status: "ACTIVE",
    questions: [],
  });

const makeUsers = (count: number) =>
  User.create(
    Array.from({ length: count }).map((_, i) => ({
      email: `user${i}-${Date.now()}@test.co`,
      role: "respondent",
      ninVerified: true,
      status: "VERIFIED",
    }))
  ) as unknown as Promise<IUser[]>;

describe("response submission concurrency", () => {
  it(
    "never accepts more responses than responsesNeeded when many submit at once",
    async () => {
      const responsesNeeded = 5;
      const payout = 100;
      const survey = await makeSurvey(responsesNeeded, payout);
      const users = await makeUsers(30);

      const results = await Promise.allSettled(
        users.map((u) => submitResponse(u, survey._id.toString(), []))
      );

      const accepted = results.filter((r) => r.status === "fulfilled").length;
      const responseCount = await SurveyResponse.countDocuments({ surveyId: survey._id });
      const fresh = await Survey.findById(survey._id);
      const wallets = await Wallet.find({});
      const totalPaid = wallets.reduce(
        (sum, w) => sum + w.availableBalance + w.pendingBalance,
        0
      );

      // The core money-safety invariant: never pay more than the funded budget.
      expect(responseCount).toBe(responsesNeeded);
      expect(accepted).toBe(responsesNeeded);
      expect(fresh?.responsesReceived).toBe(responsesNeeded);
      expect(fresh?.status).toBe("COMPLETED");
      expect(totalPaid).toBe(responsesNeeded * payout);
      expect(totalPaid).toBeLessThanOrEqual(survey.budget);
    },
    60000
  );

  it(
    "does not reserve more slots than remaining capacity under concurrent starts",
    async () => {
      const responsesNeeded = 3;
      const survey = await makeSurvey(responsesNeeded);
      const users = await makeUsers(15);

      const results = await Promise.allSettled(
        users.map((u) => startSurvey(u, survey._id.toString()))
      );

      const reserved = results.filter((r) => r.status === "fulfilled").length;
      const reservationDocs = await SurveyReservation.countDocuments({ surveyId: survey._id });
      const fresh = await Survey.findById(survey._id);

      expect(reserved).toBe(responsesNeeded);
      expect(reservationDocs).toBe(responsesNeeded);
      expect(fresh?.reservedSlots).toBe(responsesNeeded);
    },
    60000
  );

  it("converts a reservation into a response and frees the reserved slot", async () => {
    const survey = await makeSurvey(2);
    const [user] = await makeUsers(1);

    const reservation = await startSurvey(user, survey._id.toString());
    expect(reservation.reserved).toBe(true);

    let mid = await Survey.findById(survey._id);
    expect(mid?.reservedSlots).toBe(1);
    expect(mid?.responsesReceived).toBe(0);

    await submitResponse(user, survey._id.toString(), []);

    const after = await Survey.findById(survey._id);
    const reservationDocs = await SurveyReservation.countDocuments({ surveyId: survey._id });
    expect(after?.responsesReceived).toBe(1);
    expect(after?.reservedSlots).toBe(0);
    expect(reservationDocs).toBe(0);
  });

  it("rejects a second submission from the same user", async () => {
    const survey = await makeSurvey(5);
    const [user] = await makeUsers(1);

    await submitResponse(user, survey._id.toString(), []);
    await expect(submitResponse(user, survey._id.toString(), [])).rejects.toMatchObject({
      statusCode: 409,
    });

    const count = await SurveyResponse.countDocuments({ surveyId: survey._id });
    expect(count).toBe(1);
  });
});
