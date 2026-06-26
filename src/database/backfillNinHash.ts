import dotenv from "dotenv";
import { connectToDB, disconnectFromDB } from "./connection";
import { User } from "../modules/users/user.model";
import { decryptNIN, hashValue } from "../utils/encryption";

dotenv.config();

async function backfillNinHash() {
  await connectToDB();

  const users = await User.find({
    ninVerified: true,
    encryptedNin: { $exists: true, $ne: null },
    $or: [{ ninHash: { $exists: false } }, { ninHash: null }, { ninHash: "" }],
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    try {
      if (!user.encryptedNin) {
        skipped += 1;
        continue;
      }

      const nin = decryptNIN(user.encryptedNin);
      const ninHash = hashValue(nin);

      const duplicate = await User.findOne({
        ninHash,
        _id: { $ne: user._id },
      });

      if (duplicate) {
        console.warn(
          `Skipping user ${user.email}: NIN hash already used by ${duplicate.email}`
        );
        skipped += 1;
        continue;
      }

      user.ninHash = ninHash;
      await user.save();
      updated += 1;
      console.log(`Backfilled ninHash for ${user.email}`);
    } catch (err) {
      failed += 1;
      console.error(`Failed for user ${user.email}:`, err);
    }
  }

  console.log(`Backfill complete. Updated: ${updated}, Skipped: ${skipped}, Failed: ${failed}`);
  await disconnectFromDB();
}

backfillNinHash().catch(async (err) => {
  console.error(err);
  await disconnectFromDB();
  process.exit(1);
});
