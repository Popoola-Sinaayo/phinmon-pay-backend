import mongoose, { Document, Schema, Types } from "mongoose";

export type BlogStatus = "draft" | "published";

export interface IBlogPost extends Document {
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  coverImageUrl?: string;
  status: BlogStatus;
  publishedAt?: Date;
  authorId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const blogPostSchema = new Schema<IBlogPost>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    coverImageUrl: { type: String, trim: true },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date },
    authorId: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ slug: 1 }, { unique: true });

export const BlogPost = mongoose.model<IBlogPost>("BlogPost", blogPostSchema);
