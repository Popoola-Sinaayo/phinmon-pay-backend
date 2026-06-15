import mongoose, { Document, Schema, Types } from "mongoose";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface IPayment extends Document {
  surveyId: Types.ObjectId;
  researcherId: Types.ObjectId;
  amount: number;
  reference: string;
  status: PaymentStatus;
  provider: string;
  paystackAccessCode?: string;
  authorizationUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    provider: { type: String, default: "paystack" },
    paystackAccessCode: { type: String },
    authorizationUrl: { type: String },
  },
  { timestamps: true }
);

paymentSchema.index({ reference: 1 });

export const Payment = mongoose.model<IPayment>("Payment", paymentSchema);
