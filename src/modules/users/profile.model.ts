import mongoose, { Document, Schema, Types } from "mongoose";

export interface IProfile extends Document {
  userId: Types.ObjectId;
  dateOfBirth?: Date;
  age?: number;
  gender?: string;
  state?: string;
  occupation?: string;
  createdAt: Date;
  updatedAt: Date;
}

const profileSchema = new Schema<IProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dateOfBirth: { type: Date },
    age: { type: Number },
    gender: { type: String },
    state: { type: String },
    occupation: { type: String },
  },
  { timestamps: true }
);

profileSchema.index({ userId: 1 });

export const Profile = mongoose.model<IProfile>("Profile", profileSchema);
