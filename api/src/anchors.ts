import GithubSlugger from "github-slugger";
import { marked, type Token } from "marked";

/** Anchor của một tiêu đề trong bản gốc: cấp (#, ##…) và id dùng trong link "#…". */
export type Anchor = { depth: number; id: string };

/** Id tự đặt ở cuối tiêu đề: `## Tiêu đề {#custom-id}` (Docusaurus, kramdown) hoặc `## Tiêu đề [#custom-id]` (Fumadocs). */
const CUSTOM_ID = /\s*(?:\{#([^}\s]+)\}|\[#([^\]\s]+)\])\s*$/;
const customId = (m: RegExpExecArray | null) => m?.[1] ?? m?.[2];

/** Chữ hiển thị của tiêu đề (bỏ cú pháp Markdown inline) — giống chữ mà trang gốc dùng để tạo slug. */
function plainText(tokens: Token[] = []): string {
  return tokens
    .map((t) => {
      if ("tokens" in t && t.tokens?.length) return plainText(t.tokens);
      if (t.type === "html" || t.type === "br") return "";
      return "text" in t ? (t.text as string) : "";
    })
    .join("");
}

/**
 * Anchor của mọi tiêu đề Markdown trong bản gốc, theo thứ tự xuất hiện.
 * Bản dịch giữ nguyên cấu trúc nên tiêu đề thứ i của bản dịch ứng với anchor thứ i —
 * nhờ vậy link "#getting-started" vẫn trỏ đúng tiêu đề dù chữ đã thành "Bắt đầu".
 * Slug theo kiểu GitHub (Starlight, Docusaurus, VitePress… tạo slug gần giống vậy).
 */
export function headingAnchors(markdown: string): Anchor[] {
  const slugger = new GithubSlugger();
  const anchors: Anchor[] = [];
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type !== "heading") return;
    const custom = customId(CUSTOM_ID.exec(token.text));
    const id = custom ?? slugger.slug(plainText(token.tokens).replace(CUSTOM_ID, ""));
    anchors.push({ depth: token.depth, id });
  });
  return anchors;
}
