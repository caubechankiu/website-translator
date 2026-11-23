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

app.use("/api", requireSecret, websitesRouter);

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
