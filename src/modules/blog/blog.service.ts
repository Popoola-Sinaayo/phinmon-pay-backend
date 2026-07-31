import { BlogPost, BlogStatus } from "./blog.model";
import { AppError } from "../../utils/errors";

const slugify = (input: string) =>
  input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || `post-${Date.now()}`;

const ensureUniqueSlug = async (base: string, excludeId?: string) => {
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const existing = await BlogPost.findOne({
      slug: candidate,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).select("_id");
    if (!existing) return candidate;
    attempt += 1;
  }
};

export type BlogInput = {
  title: string;
  slug?: string;
  excerpt: string;
  body: string;
  coverImageUrl?: string;
  status?: BlogStatus;
};

export const listPublishedPosts = async (page = 1, limit = 12) => {
  const skip = (page - 1) * limit;
  const filter = { status: "published" as const };
  const [posts, total] = await Promise.all([
    BlogPost.find(filter)
      .sort({ publishedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("title slug excerpt coverImageUrl publishedAt createdAt updatedAt")
      .lean(),
    BlogPost.countDocuments(filter),
  ]);
  return {
    posts,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getPublishedBySlug = async (slug: string) => {
  const post = await BlogPost.findOne({ slug, status: "published" }).lean();
  if (!post) throw new AppError("Post not found", 404);
  return post;
};

export const listAllPosts = async (page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [posts, total] = await Promise.all([
    BlogPost.find()
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("title slug excerpt coverImageUrl status publishedAt createdAt updatedAt")
      .lean(),
    BlogPost.countDocuments(),
  ]);
  return {
    posts,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
};

export const getPostById = async (id: string) => {
  const post = await BlogPost.findById(id).lean();
  if (!post) throw new AppError("Post not found", 404);
  return post;
};

export const createPost = async (data: BlogInput, authorId: string) => {
  const slug = await ensureUniqueSlug(data.slug || data.title);
  const status: BlogStatus = data.status === "published" ? "published" : "draft";
  const post = await BlogPost.create({
    title: data.title.trim(),
    slug,
    excerpt: data.excerpt.trim(),
    body: data.body,
    coverImageUrl: data.coverImageUrl?.trim() || undefined,
    status,
    publishedAt: status === "published" ? new Date() : undefined,
    authorId,
  });
  return post.toObject();
};

export const updatePost = async (id: string, data: Partial<BlogInput>) => {
  const post = await BlogPost.findById(id);
  if (!post) throw new AppError("Post not found", 404);

  if (data.title !== undefined) post.title = data.title.trim();
  if (data.excerpt !== undefined) post.excerpt = data.excerpt.trim();
  if (data.body !== undefined) post.body = data.body;
  if (data.coverImageUrl !== undefined) {
    post.coverImageUrl = data.coverImageUrl.trim() || undefined;
  }
  if (data.slug !== undefined || data.title !== undefined) {
    post.slug = await ensureUniqueSlug(data.slug || data.title || post.title, id);
  }
  if (data.status !== undefined) {
    const next = data.status === "published" ? "published" : "draft";
    if (next === "published" && post.status !== "published") {
      post.publishedAt = new Date();
    }
    if (next === "draft") {
      // keep publishedAt for history when unpublishing
    }
    post.status = next;
  }

  await post.save();
  return post.toObject();
};

export const deletePost = async (id: string) => {
  const post = await BlogPost.findByIdAndDelete(id);
  if (!post) throw new AppError("Post not found", 404);
  return { deleted: true };
};
