import mongoose, { Document, Schema, Types } from "mongoose";

export interface IPaymentMethod extends Document {
  researcherId: Types.ObjectId;
  paystackAuthorizationCode: string;
  paystackCustomerCode?: string;
  last4: string;
  expMonth: string;
  expYear: string;
  brand: string;
  bank?: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentMethodSchema = new Schema<IPaymentMethod>(
  {
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    paystackAuthorizationCode: { type: String, required: true },
    paystackCustomerCode: { type: String },
    last4: { type: String, required: true },
    expMonth: { type: String, required: true },
    expYear: { type: String, required: true },
    brand: { type: String, default: "card" },
    bank: { type: String },
    isDefault: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

paymentMethodSchema.index({ researcherId: 1 });

export const PaymentMethod = mongoose.model<IPaymentMethod>("PaymentMethod", paymentMethodSchema);
