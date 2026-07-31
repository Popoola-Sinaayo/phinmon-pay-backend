import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISurveyFeedback extends Document {
  userId: Types.ObjectId;
  surveyId: Types.ObjectId;
  rating: number;
  comment?: string;
  createdAt: Date;
  updatedAt: Date;
}

const surveyFeedbackSchema = new Schema<ISurveyFeedback>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 1000, trim: true },
  },
  { timestamps: true }
);

surveyFeedbackSchema.index({ userId: 1, surveyId: 1 }, { unique: true });
surveyFeedbackSchema.index({ createdAt: -1 });
surveyFeedbackSchema.index({ surveyId: 1 });

export const SurveyFeedback = mongoose.model<ISurveyFeedback>(
  "SurveyFeedback",
  surveyFeedbackSchema
);
