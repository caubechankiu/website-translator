import type { RequestHandler } from "express";
import { z } from "zod";

/** Vercel giới hạn body response của function ~4.5MB. */
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 15_000;

const ImageUrl = z.url({ protocol: /^https?$/ });

/**
 * GET /api/image?url=...
 * Tải hộ ảnh của trang gốc cho client. Cần khi trang gốc chặn nhúng ảnh từ origin khác
 * (vd. `Cross-Origin-Resource-Policy: same-origin`), nên side panel / PWA không hiện được bằng <img> trực tiếp.
 * <img> không gửi được header nên SECRET đi qua query `token` (xem requireSecret trong index.ts).
 */
export const imageHandler: RequestHandler = async (req, res) => {
  const url = ImageUrl.safeParse(req.query.url);
  if (!url.success) {
    return res.status(400).json({ error: "Query `url` không hợp lệ" });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.data, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return res.status(502).json({ error: "Không tải được ảnh" });
  }
  if (!upstream.ok) {
    return res.status(502).json({ error: `Ảnh trả về HTTP ${upstream.status}` });
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return res.status(415).json({ error: "URL không phải ảnh" });
  }
  if (Number(upstream.headers.get("content-length")) > MAX_BYTES) {
    return res.status(413).json({ error: "Ảnh quá lớn" });
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length > MAX_BYTES) {
    return res.status(413).json({ error: "Ảnh quá lớn" });
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Phòng khi ảnh SVG bị mở trực tiếp: không cho chạy script.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  res.send(body);
};
