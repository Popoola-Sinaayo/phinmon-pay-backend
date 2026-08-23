import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import * as blogService from "./blog.service";

const router = Router();

const coverImageSchema = Joi.string()
  .allow("", null)
  .optional()
  .custom((value, helpers) => {
    if (value == null || value === "") return value;
    const v = String(value).trim();
    // Absolute http(s) URLs or site-relative paths (e.g. /blog/covers/…)
    if (/^https?:\/\//i.test(v) || /^\/[\w./\-_%]+$/.test(v)) return v;
    return helpers.error("any.invalid");
  }, "cover image url or path")
  .messages({
    "any.invalid": "Cover image must be an http(s) URL or a site path starting with /",
  });

const postBodySchema = Joi.object({
  title: Joi.string().min(3).max(200).required(),
  slug: Joi.string().max(120).allow("", null).optional(),
  excerpt: Joi.string().min(10).max(500).required(),
  body: Joi.string().min(20).required(),
  coverImageUrl: coverImageSchema,
  status: Joi.string().valid("draft", "published").optional(),
});

const postUpdateSchema = Joi.object({
  title: Joi.string().min(3).max(200).optional(),
  slug: Joi.string().max(120).allow("", null).optional(),
  excerpt: Joi.string().min(10).max(500).optional(),
  body: Joi.string().min(20).optional(),
  coverImageUrl: coverImageSchema,
  status: Joi.string().valid("draft", "published").optional(),
}).min(1);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const result = await blogService.listAllPosts(page, limit);
    res.json({ success: true, ...result });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const post = await blogService.getPostById(String(req.params.id));
    res.json({ success: true, post });
  })
);

router.post(
  "/",
  validate(postBodySchema),
  asyncHandler(async (req, res) => {
    const post = await blogService.createPost(req.body, req.user!._id.toString());
    res.status(201).json({ success: true, post });
  })
);

router.patch(
  "/:id",
  validate(postUpdateSchema),
  asyncHandler(async (req, res) => {
    const post = await blogService.updatePost(String(req.params.id), req.body);
    res.json({ success: true, post });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const result = await blogService.deletePost(String(req.params.id));
    res.json({ success: true, ...result });
  })
);

export default router;
