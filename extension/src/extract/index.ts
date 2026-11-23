/**
 * Chuyển nội dung trang sang Markdown khi trang không có nút "Copy page".
 * Được inject vào tab (ISOLATED world) bằng chrome.scripting.executeScript({ files }) —
 * script chỉ đăng ký hàm lên globalThis, lần gọi executeScript thứ hai mới chạy nó.
 */
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { ADAPTERS, type Adapter } from "./adapters";
import { absolutizeUrls, flattenDetails, normalizePre, removeAll, text } from "./helpers";

export type ExtractResult = { markdown: string; adapter: string };

/** Phần tử không bao giờ là nội dung, bỏ với mọi framework. */
const ALWAYS_REMOVE = [
  "script",
  "style",
  "link",
  "noscript",
  "template",
  "svg",
  "button",
  "input",
  "select",
  "textarea",
  "iframe",
  ".sr-only",
  ".visually-hidden",
];

/** Chọn phần tử dài nhất trong các ứng viên của selector đầu tiên có kết quả. */
function findRoot(doc: Document, adapter: Adapter): Element | null {
  for (const selector of adapter.root) {
    const matches = [...doc.querySelectorAll(selector)];
    if (!matches.length) continue;
    return matches.reduce((a, b) => ((b.textContent?.length ?? 0) > (a.textContent?.length ?? 0) ? b : a));
  }
  return null;
}

function toMarkdown(html: Element): string {
  const service = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
  });
  service.use(gfm);
  return service
    .turndown(html as HTMLElement)
    .replace(/​/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMarkdown(): ExtractResult | null {
  for (const adapter of ADAPTERS) {
    if (!adapter.detect(document)) continue;
    const original = findRoot(document, adapter);
    if (!original) continue;

    const root = original.cloneNode(true) as Element;
    removeAll(root, adapter.remove);
    adapter.normalize?.(root);
    removeAll(root, ALWAYS_REMOVE);
    flattenDetails(root);
    normalizePre(root);
    absolutizeUrls(root);

    let markdown = toMarkdown(root);
    if (!markdown) continue;

    // Nhiều theme đặt h1 ngoài vùng nội dung — thêm lại tiêu đề cho bản dịch.
    if (!root.querySelector("h1")) {
      const title = adapter.title?.(document) ?? (text(document.querySelector("h1")) || document.title.trim());
      if (title) markdown = `# ${title}\n\n${markdown}`;
    }
    return { markdown, adapter: adapter.name };
  }
  return null;
}

(globalThis as { __websiteTranslatorExtract?: () => ExtractResult | null }).__websiteTranslatorExtract =
  extractMarkdown;
