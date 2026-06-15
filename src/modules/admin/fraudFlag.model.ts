import mongoose, { Document, Schema, Types } from "mongoose";

export interface IFraudFlag extends Document {
  userId: Types.ObjectId;
  reason: string;
  severity: "low" | "medium" | "high";
  resolved: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const fraudFlagSchema = new Schema<IFraudFlag>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    resolved: { type: Boolean, default: false },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const FraudFlag = mongoose.model<IFraudFlag>("FraudFlag", fraudFlagSchema);
