/**
 * Hiển thị bản dịch Markdown — dùng chung cho side panel của extension và web (PWA).
 * marked / dompurify / highlight.js / mermaid được resolve từ node_modules của package đang build
 * (esbuild `nodePaths` + tsconfig `paths`), nên package nào import file này phải tự cài các thư viện đó.
 */
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { marked } from "marked";

/** Đổi đường dẫn tương đối thành tuyệt đối theo URL trang gốc. */
function absolutize(el: Element, attr: string, baseUrl: string) {
  const value = el.getAttribute(attr);
  if (!value) return;
  try {
    el.setAttribute(attr, new URL(value, baseUrl).href);
  } catch {
    /* URL không hợp lệ thì giữ nguyên */
  }
}

/**
 * Tô màu code block theo class "language-xxx" do marked sinh ra.
 * Không ghi ngôn ngữ (hoặc ngôn ngữ lạ) thì để highlight.js tự đoán.
 * highlight.js đọc textContent nên không mở lại lỗ hổng XSS sau DOMPurify.
 */
function highlightCode(container: HTMLElement) {
  for (const code of container.querySelectorAll<HTMLElement>("pre code:not(.language-mermaid)")) {
    const lang = /\blanguage-(\S+)/.exec(code.className)?.[1];
    if (lang && !hljs.getLanguage(lang)) code.classList.remove(`language-${lang}`);
    hljs.highlightElement(code);
  }
}

type Mermaid = typeof import("mermaid").default;
let mermaidPromise: Promise<Mermaid> | undefined;
let mermaidTheme: string | undefined;
let mermaidSeq = 0;

/**
 * Mermaid nặng (~vài MB) nên chỉ tải (dynamic import → chunk riêng) khi trang có sơ đồ.
 * securityLevel "strict": mermaid tự sanitize nhãn và tắt click/script trong sơ đồ.
 */
async function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import("mermaid").then((m) => m.default);
  const mermaid = await mermaidPromise;
  const theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";
  if (theme !== mermaidTheme) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme, fontFamily: "inherit" });
    mermaidTheme = theme;
  }
  return mermaid;
}

/**
 * Thay các code block ```mermaid bằng sơ đồ SVG. Sơ đồ lỗi cú pháp thì giữ nguyên code block.
 * Chạy bất đồng bộ: nếu container đã render lại trong lúc chờ thì bỏ qua block đã bị gỡ khỏi DOM.
 */
async function renderMermaid(container: HTMLElement) {
  const blocks = [...container.querySelectorAll<HTMLElement>("pre > code.language-mermaid")];
  if (!blocks.length) return;
  let mermaid: Mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    console.error("Không tải được mermaid", err);
    return;
  }
  for (const code of blocks) {
    const pre = code.parentElement!;
    if (!pre.isConnected) continue;
    try {
      const { svg } = await mermaid.render(`mermaid-${++mermaidSeq}`, code.textContent ?? "");
      if (!pre.isConnected) continue;
      const figure = document.createElement("div");
      figure.className = "mermaid-diagram";
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (err) {
      console.warn("Sơ đồ mermaid không hợp lệ, hiển thị dạng code", err);
      // mermaid.render có thể để lại phần tử tạm (#dmermaid-…) trong body khi lỗi.
      document.getElementById(`dmermaid-${mermaidSeq}`)?.remove();
    }
  }
}

/** Render Markdown đã sanitize vào `container`; link và ảnh tương đối tính theo `baseUrl` (trang gốc). */
export function renderMarkdown(container: HTMLElement, markdown: string, baseUrl: string) {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown, { async: false }));
  for (const img of container.querySelectorAll("img")) absolutize(img, "src", baseUrl);
  highlightCode(container);
  void renderMermaid(container);
  // Link trong bản dịch trỏ về trang gốc, mở ở tab mới.
  for (const a of container.querySelectorAll("a")) {
    absolutize(a, "href", baseUrl);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}
