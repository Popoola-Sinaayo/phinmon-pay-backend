import mongoose, { Document, Schema, Types } from "mongoose";

export type TransactionType =
  | "EARNING"
  | "WITHDRAWAL"
  | "REFUND"
  | "PAYMENT"
  | "ADJUSTMENT";

export type TransactionStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface ITransaction extends Document {
  userId: Types.ObjectId;
  type: TransactionType;
  amount: number;
  reference: string;
  status: TransactionStatus;
  description: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["EARNING", "WITHDRAWAL", "REFUND", "PAYMENT", "ADJUSTMENT"],
      required: true,
    },
    amount: { type: Number, required: true },
    reference: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "PENDING",
    },
    description: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1 });
transactionSchema.index({ reference: 1 });

export const Transaction = mongoose.model<ITransaction>("Transaction", transactionSchema);
