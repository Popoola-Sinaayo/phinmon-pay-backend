import mongoose, { Document, Schema, Types } from "mongoose";

export type AdminEmailCampaignStatus = "completed" | "partial" | "failed";

export interface IAdminEmailCampaign extends Document {
  sentBy: Types.ObjectId;
  audience: string;
  audienceLabel: string;
  template: string;
  subject: string;
  messagePreview?: string;
  headline?: string;
  userIds?: Types.ObjectId[];
  signedUpSince?: Date;
  totalRecipients: number;
  sent: number;
  failed: number;
  status: AdminEmailCampaignStatus;
  createdAt: Date;
}

const adminEmailCampaignSchema = new Schema<IAdminEmailCampaign>(
  {
    sentBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    audience: { type: String, required: true },
    audienceLabel: { type: String, required: true },
    template: { type: String, required: true },
    subject: { type: String, required: true },
    messagePreview: { type: String },
    headline: { type: String },
    userIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    signedUpSince: { type: Date },
    totalRecipients: { type: Number, required: true },
    sent: { type: Number, required: true },
    failed: { type: Number, required: true },
    status: {
      type: String,
      enum: ["completed", "partial", "failed"],
      required: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

adminEmailCampaignSchema.index({ createdAt: -1 });

export const AdminEmailCampaign = mongoose.model<IAdminEmailCampaign>(
  "AdminEmailCampaign",
  adminEmailCampaignSchema
);
