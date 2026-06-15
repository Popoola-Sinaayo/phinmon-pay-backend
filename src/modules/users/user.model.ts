import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "respondent" | "researcher" | "admin";
export type UserStatus = "PENDING_VERIFICATION" | "VERIFIED" | "PREMIUM";

export interface IUser extends Document {
  name?: string;
  email: string;
  role: UserRole;
  ninVerified: boolean;
  livenessVerified: boolean;
  status: UserStatus;
  encryptedNin?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: {
      type: String,
      enum: ["respondent", "researcher", "admin"],
      default: "respondent",
    },
    ninVerified: { type: Boolean, default: false },
    livenessVerified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["PENDING_VERIFICATION", "VERIFIED", "PREMIUM"],
      default: "PENDING_VERIFICATION",
    },
    encryptedNin: { type: String },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>("User", userSchema);
