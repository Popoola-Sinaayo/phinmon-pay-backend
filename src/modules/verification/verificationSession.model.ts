import mongoose, { Document, Schema } from "mongoose";

export interface IVerificationSession extends Document {
  userId: mongoose.Types.ObjectId;
  type: "liveness" | "nin_liveness";
  sessionId: string;
  reference: string;
  expiresAt: Date;
  completed: boolean;
  createdAt: Date;
}

const verificationSessionSchema = new Schema<IVerificationSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["liveness", "nin_liveness"], required: true },
    sessionId: { type: String, required: true, index: true },
    reference: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const VerificationSession = mongoose.model<IVerificationSession>(
  "VerificationSession",
  verificationSessionSchema
);
