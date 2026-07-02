import mongoose, { Document, Schema, Types } from "mongoose";

export type SurveyAudience = "ALL_VERIFIED" | "PREMIUM_ONLY" | "ALL_USERS";
export type SurveyStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "ACTIVE"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";
export type BillingModel = "PREPAID" | "PAYG";
export type QuestionType =
  | "text"
  | "text_short"
  | "text_long"
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
  platformFeeAmount: number;
  platformFeeRate: number;
  totalCost: number;
  payoutPerResponse: number;
  rewardPerResponseStandard: number;
  rewardPerResponsePremium: number;
  responsesNeeded: number;
  responsesReceived: number;
  status: SurveyStatus;
  billingModel: BillingModel;
  draftStep?: number;
  spendingCap: number;
  amountSpent: number;
  billingLocked: boolean;
  billingLockReason?: string;
  questions: IQuestion[];
  estimatedMinutes?: number;
  estimatedCompletionTimeSeconds: number;
  estimatedCompletionTimeMinutes: number;
  highComplexity: boolean;
  aiSpamFilterEnabled: boolean;
  aiAnalyticsEnabled: boolean;
  aiAddOnsCost: number;
  aiSpamFilterCost: number;
  aiAnalyticsCost: number;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<IQuestion>(
  {
    questionId: { type: String, required: true },
    questionText: { type: String, required: true },
    type: {
      type: String,
      enum: [
        "text",
        "text_short",
        "text_long",
        "single_choice",
        "multiple_choice",
        "number",
        "rating",
        "boolean",
      ],
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
    platformFeeAmount: { type: Number, default: 0 },
    platformFeeRate: { type: Number, default: 25 },
    totalCost: { type: Number, default: 0 },
    payoutPerResponse: { type: Number, required: true },
    rewardPerResponseStandard: { type: Number, default: 0 },
    rewardPerResponsePremium: { type: Number, default: 0 },
    responsesNeeded: { type: Number, required: true },
    responsesReceived: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["DRAFT", "PENDING_PAYMENT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"],
      default: "DRAFT",
    },
    draftStep: { type: Number, default: 0, min: 0, max: 6 },
    billingModel: {
      type: String,
      enum: ["PREPAID", "PAYG"],
      default: "PREPAID",
    },
    spendingCap: { type: Number, default: 0 },
    amountSpent: { type: Number, default: 0 },
    billingLocked: { type: Boolean, default: false },
    billingLockReason: { type: String },
    questions: [questionSchema],
    estimatedMinutes: { type: Number, default: 1 },
    estimatedCompletionTimeSeconds: { type: Number, default: 0 },
    estimatedCompletionTimeMinutes: { type: Number, default: 1 },
    highComplexity: { type: Boolean, default: false },
    aiSpamFilterEnabled: { type: Boolean, default: false },
    aiAnalyticsEnabled: { type: Boolean, default: false },
    aiAddOnsCost: { type: Number, default: 0 },
    aiSpamFilterCost: { type: Number, default: 0 },
    aiAnalyticsCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

surveySchema.index({ researcherId: 1 });
surveySchema.index({ status: 1 });

export const Survey = mongoose.model<ISurvey>("Survey", surveySchema);
