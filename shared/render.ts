/**
 * Hiển thị bản dịch Markdown — dùng chung cho side panel của extension và web (PWA).
 * marked / dompurify / highlight.js được resolve từ node_modules của package đang build
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
  for (const code of container.querySelectorAll<HTMLElement>("pre code")) {
    const lang = /\blanguage-(\S+)/.exec(code.className)?.[1];
    if (lang && !hljs.getLanguage(lang)) code.classList.remove(`language-${lang}`);
    hljs.highlightElement(code);
  }
}

/** Render Markdown đã sanitize vào `container`; link và ảnh tương đối tính theo `baseUrl` (trang gốc). */
export function renderMarkdown(container: HTMLElement, markdown: string, baseUrl: string) {
  container.innerHTML = DOMPurify.sanitize(marked.parse(markdown, { async: false }));
  for (const img of container.querySelectorAll("img")) absolutize(img, "src", baseUrl);
  highlightCode(container);
  // Link trong bản dịch trỏ về trang gốc, mở ở tab mới.
  for (const a of container.querySelectorAll("a")) {
    absolutize(a, "href", baseUrl);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}
