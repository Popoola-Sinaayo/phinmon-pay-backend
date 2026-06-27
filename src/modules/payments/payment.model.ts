import mongoose, { Document, Schema, Types } from "mongoose";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";
export type PaymentPurpose = "PREPAID" | "CARD_SETUP" | "DEBT_SETTLEMENT" | "AI_ANALYTICS_ADDON";

export interface IPayment extends Document {
  surveyId?: Types.ObjectId;
  researcherId: Types.ObjectId;
  amount: number;
  reference: string;
  status: PaymentStatus;
  purpose: PaymentPurpose;
  provider: string;
  paystackAccessCode?: string;
  authorizationUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey" },
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    purpose: {
      type: String,
      enum: ["PREPAID", "CARD_SETUP", "DEBT_SETTLEMENT", "AI_ANALYTICS_ADDON"],
      default: "PREPAID",
    },
    provider: { type: String, default: "paystack" },
    paystackAccessCode: { type: String },
    authorizationUrl: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

paymentSchema.index({ reference: 1 });

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
