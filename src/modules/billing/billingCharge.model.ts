import mongoose, { Document, Schema, Types } from "mongoose";

export type BillingChargeType = "RESPONSE_CHARGE" | "DEBT_SETTLEMENT" | "CARD_SETUP";
export type BillingChargeStatus = "PENDING" | "SUCCESS" | "FAILED";

export interface IBillingCharge extends Document {
  researcherId: Types.ObjectId;
  surveyId?: Types.ObjectId;
  responseId?: Types.ObjectId;
  amount: number;
  reference: string;
  type: BillingChargeType;
  status: BillingChargeStatus;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const billingChargeSchema = new Schema<IBillingCharge>(
  {
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey" },
    responseId: { type: Schema.Types.ObjectId, ref: "SurveyResponse" },
    amount: { type: Number, required: true },
    reference: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ["RESPONSE_CHARGE", "DEBT_SETTLEMENT", "CARD_SETUP"],
      required: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    failureReason: { type: String },
  },
  { timestamps: true }
);

billingChargeSchema.index({ researcherId: 1, createdAt: -1 });

export const BillingCharge = mongoose.model<IBillingCharge>("BillingCharge", billingChargeSchema);
