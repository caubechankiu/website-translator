import { cp, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await cp("public", "dist", { recursive: true });
await cp("../shared/theme.css", "dist/theme.css");

const common = {
  outdir: "dist",
  bundle: true,
  // ../shared/*.ts không có node_modules riêng — resolve thư viện từ node_modules của extension.
  nodePaths: [new URL("node_modules", import.meta.url).pathname],
  target: "chrome120",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
};

const contexts = await Promise.all([
  // Service worker và script inject vào trang phải là 1 file IIFE.
  esbuild.context({
    ...common,
    entryPoints: ["src/background.ts", { in: "src/extract/index.ts", out: "extract" }],
    format: "iife",
  }),
  // Trang của extension: ESM + splitting để mermaid (nặng) tách thành chunk, chỉ tải khi cần.
  esbuild.context({
    ...common,
    entryPoints: ["src/sidepanel.ts", "src/options.ts"],
    format: "esm",
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
  }),
]);

if (watch) {
  await Promise.all(contexts.map((ctx) => ctx.watch())); // lưu ý: file trong public/ chỉ copy lúc khởi động
} else {
  await Promise.all(contexts.map((ctx) => ctx.rebuild()));
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
}
