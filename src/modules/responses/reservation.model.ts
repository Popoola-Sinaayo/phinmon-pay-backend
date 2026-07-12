import mongoose, { Document, Schema, Types } from "mongoose";

export interface ISurveyReservation extends Document {
  surveyId: Types.ObjectId;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const surveyReservationSchema = new Schema<ISurveyReservation>(
  {
    surveyId: { type: Schema.Types.ObjectId, ref: "Survey", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One live reservation per user per survey.
surveyReservationSchema.index({ surveyId: 1, userId: 1 }, { unique: true });
// Support sweeping expired reservations. We intentionally do NOT use a TTL
// auto-delete index here: reservations must be removed by our own sweep so the
// survey's reservedSlots counter stays in sync with the number of live holds.
surveyReservationSchema.index({ expiresAt: 1 });

export const SurveyReservation = mongoose.model<ISurveyReservation>(
  "SurveyReservation",
  surveyReservationSchema
);
