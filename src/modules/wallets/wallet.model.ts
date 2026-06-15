import mongoose, { Document, Schema, Types } from "mongoose";

export interface IWallet extends Document {
  userId: Types.ObjectId;
  availableBalance: number;
  pendingBalance: number;
  lifetimeEarnings: number;
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    availableBalance: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    lifetimeEarnings: { type: Number, default: 0 },
  },
  { timestamps: true }
);

walletSchema.index({ userId: 1 }, { unique: true });

export const Wallet = mongoose.model<IWallet>("Wallet", walletSchema);
