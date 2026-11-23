import { timingSafeEqual } from "node:crypto";
import express, { type ErrorRequestHandler, type RequestHandler } from "express";
import { config } from "./config.js";
import { websitesRouter } from "./routes/websites.js";
import { TranslationError } from "./translator.js";

const app = express();
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// CORS mở cho mọi origin để web (PWA) ở domain khác gọi được. An toàn vì API xác thực bằng
// header Authorization (không dùng cookie) — không có SECRET thì origin nào cũng bị 401.
// Đặt trước requireSecret: preflight OPTIONS không mang header Authorization.
const cors: RequestHandler = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
};

// Xác thực bằng header: Authorization: Bearer <SECRET>
const requireSecret: RequestHandler = (req, res, next) => {
  const token = req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(token);
  const b = Buffer.from(config.SECRET);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

app.use("/api", cors, requireSecret, websitesRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (err instanceof TranslationError) {
    return res.status(502).json({ error: err.message });
  }
  res.status(500).json({ error: "Internal Server Error" });
};
app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});
