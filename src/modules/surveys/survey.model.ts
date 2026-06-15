import mongoose, { Document, Schema, Types } from "mongoose";

export type SurveyAudience = "ALL_VERIFIED" | "PREMIUM_ONLY" | "ALL_USERS";
export type SurveyStatus = "DRAFT" | "PENDING_PAYMENT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
export type QuestionType =
  | "text"
  | "single_choice"
  | "multiple_choice"
  | "number"
  | "rating"
  | "boolean";

export interface IQuestion {
  questionId: string;
  questionText: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  configuration?: Record<string, unknown>;
}

export interface ISurvey extends Document {
  title: string;
  description: string;
  category?: string;
  researcherId: Types.ObjectId;
  targetAudience: SurveyAudience;
  budget: number;
  platformFee: number;
  totalCost: number;
  payoutPerResponse: number;
  responsesNeeded: number;
  responsesReceived: number;
  status: SurveyStatus;
  questions: IQuestion[];
  estimatedMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "single_choice", "multiple_choice", "number", "rating", "boolean"],
      required: true,
    },
    required: { type: Boolean, default: true },
    options: [String],
    configuration: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const surveySchema = new Schema<ISurvey>(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String },
    researcherId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetAudience: {
      type: String,
      enum: ["ALL_VERIFIED", "PREMIUM_ONLY", "ALL_USERS"],
      default: "ALL_VERIFIED",
    },
    budget: { type: Number, default: 0 },
    platformFee: { type: Number, default: 0 },
    totalCost: { type: Number, default: 0 },
    payoutPerResponse: { type: Number, required: true },
    responsesNeeded: { type: Number, required: true },
    responsesReceived: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_PAYMENT", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    questions: [questionSchema],
    estimatedMinutes: { type: Number, default: 10 },
  },
  { timestamps: true }
);

surveySchema.index({ researcherId: 1 });
surveySchema.index({ status: 1 });

export const Survey = mongoose.model<ISurvey>("Survey", surveySchema);
