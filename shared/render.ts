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

// Icon kiểu Octicons (GitHub), dùng currentColor để theo màu chữ của nút.
const ICON_COPY =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path fill="currentColor" d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>';
const ICON_CHECK =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>';
const ICON_ERROR =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>';

/**
 * Bọc mỗi <pre> trong .code-block kèm nút sao chép (chỉ có icon). Nút đặt ngoài <pre> để không trôi theo khi cuộn ngang.
 * Sao chép textContent của <code> (nội dung gốc, không lẫn markup của highlight.js).
 */
function addCopyButtons(container: HTMLElement) {
  for (const pre of container.querySelectorAll("pre")) {
    const wrapper = document.createElement("div");
    wrapper.className = "code-block";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    const setState = (icon: string, label: string, state?: string) => {
      button.innerHTML = icon;
      button.title = label;
      button.setAttribute("aria-label", label);
      if (state) button.dataset.state = state;
      else delete button.dataset.state;
    };
    setState(ICON_COPY, "Sao chép code");
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", async () => {
      const text = (pre.querySelector("code") ?? pre).textContent ?? "";
      try {
        await navigator.clipboard.writeText(text);
        setState(ICON_CHECK, "Đã sao chép", "ok");
      } catch {
        setState(ICON_ERROR, "Không sao chép được", "error");
      }
      clearTimeout(timer);
      timer = setTimeout(() => setState(ICON_COPY, "Sao chép code"), 1500);
    });
    pre.replaceWith(wrapper);
    wrapper.append(pre, button);
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
    // Thay cả khung .code-block (gồm nút sao chép) bằng sơ đồ.
    const pre = code.closest(".code-block") ?? code.parentElement!;
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
  addCopyButtons(container);
  void renderMermaid(container);
  // Link trong bản dịch trỏ về trang gốc, mở ở tab mới.
  for (const a of container.querySelectorAll("a")) {
    absolutize(a, "href", baseUrl);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}
