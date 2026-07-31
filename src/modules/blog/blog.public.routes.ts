import { Router } from "express";
import Joi from "joi";
import { asyncHandler } from "../../middleware/errorHandler";
import { validate } from "../../middleware/validate";
import * as blogService from "./blog.service";

const router = Router();

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
    const result = await blogService.listPublishedPosts(page, limit);
    res.json({ success: true, ...result });
  })
);

router.get(
  "/:slug",
  asyncHandler(async (req, res) => {
    const post = await blogService.getPublishedBySlug(String(req.params.slug));
    res.json({ success: true, post });
  })
);

export default router;
