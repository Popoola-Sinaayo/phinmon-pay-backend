import mongoose, { Document, Schema, Types } from "mongoose";

export type WithdrawalStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface IWithdrawal extends Document {
  userId: Types.ObjectId;
  amount: number;
  bankId: Types.ObjectId;
  reference: string;
  status: WithdrawalStatus;
  paystackTransferCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const withdrawalSchema = new Schema<IWithdrawal>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    bankId: { type: Schema.Types.ObjectId, ref: "BankAccount", required: true },
    reference: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    paystackTransferCode: { type: String },
  },
  { timestamps: true }
);

withdrawalSchema.index({ userId: 1 });

export const Withdrawal = mongoose.model<IWithdrawal>("Withdrawal", withdrawalSchema);
