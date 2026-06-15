import mongoose, { Document, Schema, Types } from "mongoose";

export interface IBankAccount extends Document {
  userId: Types.ObjectId;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  recipientCode?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const bankAccountSchema = new Schema<IBankAccount>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    bankName: { type: String, required: true },
    bankCode: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
    recipientCode: { type: String },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

bankAccountSchema.index({ userId: 1 });

export const BankAccount = mongoose.model<IBankAccount>("BankAccount", bankAccountSchema);
