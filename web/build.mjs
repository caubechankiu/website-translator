// Build PWA ra dist/ (site tĩnh). Cần biến môi trường API_URL, vd. https://<api>.vercel.app
import { cp, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

// Đọc web/.env nếu có (local). Trên Vercel không có file này, biến lấy từ cài đặt project.
// Biến đã có sẵn trong môi trường (vd. API_URL=... npm run build) được ưu tiên hơn .env.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch (err) {
  if (err.code !== "ENOENT") throw err;
}

const watch = process.argv.includes("--watch");
const apiUrl = (process.env.API_URL ?? (watch ? "http://localhost:3000" : "")).trim().replace(/\/+$/, "");
if (!/^https?:\/\//.test(apiUrl)) {
  console.error("Thiếu API_URL (vd. API_URL=https://<api>.vercel.app npm run build)");
  process.exit(1);
}

await rm("dist", { recursive: true, force: true });
await cp("public", "dist", { recursive: true });
await cp("../shared/theme.css", "dist/theme.css");

const ctx = await esbuild.context({
  entryPoints: ["src/app.ts"],
  outdir: "dist",
  bundle: true,
  // ../shared/*.ts không có node_modules riêng — resolve thư viện từ node_modules của web.
  nodePaths: [new URL("node_modules", import.meta.url).pathname],
  define: { __API_URL__: JSON.stringify(apiUrl) },
  // ESM + splitting để mermaid (nặng) tách thành chunk, chỉ tải khi bản dịch có sơ đồ.
  format: "esm",
  splitting: true,
  chunkNames: "chunks/[name]-[hash]",
  target: ["chrome120", "safari16"],
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) {
  await ctx.watch(); // lưu ý: file trong public/ chỉ copy lúc khởi động
  const { port } = await ctx.serve({ servedir: "dist", port: 5173 });
  console.log(`PWA: http://localhost:${port}  (API: ${apiUrl})`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
