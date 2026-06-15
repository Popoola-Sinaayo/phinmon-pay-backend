import mongoose, { Document, Schema, Types } from "mongoose";
import { QuestionType } from "../surveys/survey.model";

export type ResponseStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IAnswer {
  questionId: string;
  type: QuestionType;
  value: unknown;
}

export interface ISurveyResponse extends Document {
  surveyId: Types.ObjectId;
  userId: Types.ObjectId;
  answers: IAnswer[];
  status: ResponseStatus;
  rewardAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const answerSchema = new Schema<IAnswer>(
  {
    questionId: { type: String, required: true },
    type: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { _id: false }
);

const surveyResponseSchema = new Schema<ISurveyResponse>(
  {
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    answers: [answerSchema],
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    rewardAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

surveyResponseSchema.index({ surveyId: 1 });
surveyResponseSchema.index({ userId: 1 });
surveyResponseSchema.index({ surveyId: 1, userId: 1 }, { unique: true });

export const SurveyResponse = mongoose.model<ISurveyResponse>(
  "SurveyResponse",
  surveyResponseSchema
);
