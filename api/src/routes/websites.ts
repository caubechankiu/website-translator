import { Router } from "express";
import { z } from "zod";
import { findWebsiteByUrl, upsertWebsite, type Website } from "../db.js";
import { translateToVietnamese } from "../translator.js";

export const websitesRouter = Router();

/** Bỏ phần #hash để cùng 1 trang không bị lưu nhiều bản. */
function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  u.hash = "";
  return u.toString();
}

const UrlSchema = z.url({ protocol: /^https?$/ }).transform(normalizeUrl);

const TranslateBody = z.object({
  url: UrlSchema,
  content: z.string().trim().min(1),
  /** true = dịch lại kể cả khi nội dung không đổi */
  force: z.boolean().optional().default(false),
});

const toResponse = (w: Website, cached: boolean) => ({
  url: w.url,
  translatedContent: w.translatedContent,
  translatedAt: w.translatedAt,
  cached,
});

// POST /api/translate  { url, content, force? }
websitesRouter.post("/translate", async (req, res) => {
  const body = TranslateBody.safeParse(req.body);
  if (!body.success) {
    return res.status(400).json({ error: z.prettifyError(body.error) });
  }
  const { url, content, force } = body.data;

  // Nội dung không đổi -> trả bản dịch đã lưu, khỏi gọi Claude.
  const existing = await findWebsiteByUrl(url);
  if (existing && existing.originalContent === content && !force) {
    return res.json(toResponse(existing, true));
  }

  const translatedContent = await translateToVietnamese(url, content);
  const saved = await upsertWebsite({ url, originalContent: content, translatedContent });
  res.json(toResponse(saved, false));
});

// GET /api/websites?url=...
websitesRouter.get("/websites", async (req, res) => {
  const url = UrlSchema.safeParse(req.query.url);
  if (!url.success) {
    return res.status(400).json({ error: "Query `url` không hợp lệ" });
  }
  const website = await findWebsiteByUrl(url.data);
  if (!website) {
    return res.status(404).json({ error: "Trang này chưa được dịch" });
  }
  res.json(toResponse(website, true));
});
