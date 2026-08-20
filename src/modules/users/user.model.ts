import mongoose, { Document, Schema } from "mongoose";

export type UserRole = "respondent" | "researcher" | "admin";
export type UserStatus = "PENDING_VERIFICATION" | "VERIFIED" | "PREMIUM" | "SUSPENDED";

export interface IUser extends Document {
  name?: string;
  email: string;
  role: UserRole;
  ninVerified: boolean;
  livenessVerified: boolean;
  status: UserStatus;
  suspendedAt?: Date;
  suspensionReason?: string;
  encryptedNin?: string;
  ninHash?: string;
  ninData?: string;
  ninLockedUntil?: Date;
  /** Count of billed verification attempts that did not succeed (NIN or liveness). */
  ninMismatchCount?: number;
  withdrawalPinHash?: string;
  termsAcceptedAt?: Date;
  termsVersion?: string;
  deletionRequestedAt?: Date;
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
      enum: ["PENDING_VERIFICATION", "VERIFIED", "PREMIUM", "SUSPENDED"],
      default: "PENDING_VERIFICATION",
    },
    suspendedAt: { type: Date },
    suspensionReason: { type: String },
    encryptedNin: { type: String },
    ninHash: { type: String, unique: true, sparse: true },
    ninData: { type: String },
    ninLockedUntil: { type: Date },
    ninMismatchCount: { type: Number, default: 0 }, // billed failed attempts; drives escalating cooldown
    withdrawalPinHash: { type: String, select: false },
    termsAcceptedAt: { type: Date },
    termsVersion: { type: String },
    deletionRequestedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });

export const User = mongoose.model<IUser>("User", userSchema);
