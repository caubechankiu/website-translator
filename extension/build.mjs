import { cp, rm } from "node:fs/promises";
import * as esbuild from "esbuild";

const watch = process.argv.includes("--watch");

await rm("dist", { recursive: true, force: true });
await cp("public", "dist", { recursive: true });

const ctx = await esbuild.context({
  entryPoints: ["src/background.ts", "src/sidepanel.ts", "src/options.ts"],
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  logLevel: "info",
});

if (watch) {
  await ctx.watch(); // lưu ý: file trong public/ chỉ copy lúc khởi động
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
