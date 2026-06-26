import mongoose from "mongoose";
import config from "../config";

export const connectToDB = async (): Promise<void> => {
  const uri = config().MONGODB_URI;
  await mongoose.connect(uri);
  console.log("Connected to MongoDB");
};

export const disconnectFromDB = async (): Promise<void> => {
  await mongoose.disconnect();
  console.log("Disconnected from MongoDB");
};
