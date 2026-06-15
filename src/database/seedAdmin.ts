import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../modules/users/user.model";
import { Wallet } from "../modules/wallets/wallet.model";

dotenv.config();

const seedAdmin = async () => {
  const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/insightpay";
  await mongoose.connect(uri);

  const email = process.env.ADMIN_EMAIL || "admin@insightpay.ng";
  let admin = await User.findOne({ email });

  if (!admin) {
    admin = await User.create({
      email,
      name: "Admin",
      role: "admin",
      ninVerified: true,
      livenessVerified: true,
      status: "PREMIUM",
    });
    await Wallet.create({ userId: admin._id });
    console.log(`Admin created: ${email}`);
  } else {
    admin.role = "admin";
    await admin.save();
    console.log(`Admin updated: ${email}`);
  }

  await mongoose.disconnect();
};

seedAdmin().catch((err) => {
  console.error(err);
  process.exit(1);
});
