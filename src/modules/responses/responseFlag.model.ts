import mongoose, { Document, Schema, Types } from "mongoose";

export interface IResponseFlag extends Document {
  responseId: Types.ObjectId;
  surveyId: Types.ObjectId;
  researcherId: Types.ObjectId;
  userId: Types.ObjectId;
  reason?: string;
  createdAt: Date;
}

const responseFlagSchema = new Schema<IResponseFlag>(
  {
    responseId: { type: Schema.Types.ObjectId, ref: "SurveyResponse", required: true },
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

responseFlagSchema.index({ responseId: 1, researcherId: 1 }, { unique: true });
responseFlagSchema.index({ userId: 1 });

export const ResponseFlag = mongoose.model<IResponseFlag>("ResponseFlag", responseFlagSchema);
