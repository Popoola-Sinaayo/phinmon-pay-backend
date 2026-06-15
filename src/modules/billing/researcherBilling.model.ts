import mongoose, { Document, Schema, Types } from "mongoose";

export type ResearcherBillingStatus = "ACTIVE" | "PAST_DUE" | "LOCKED";

export interface IResearcherBilling extends Document {
  researcherId: Types.ObjectId;
  status: ResearcherBillingStatus;
  outstandingDebt: number;
  totalSpent: number;
  defaultPaymentMethodId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const researcherBillingSchema = new Schema<IResearcherBilling>(
  {
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    status: {
      type: String,
      enum: ["ACTIVE", "PAST_DUE", "LOCKED"],
      default: "ACTIVE",
    },
    outstandingDebt: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    defaultPaymentMethodId: { type: Schema.Types.ObjectId, ref: "PaymentMethod" },
  },
  { timestamps: true }
);

export const ResearcherBilling = mongoose.model<IResearcherBilling>(
  "ResearcherBilling",
  researcherBillingSchema
);
