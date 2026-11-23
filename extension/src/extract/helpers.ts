/**
 * Các bước chuẩn hoá dùng chung: đưa component đặc thù của framework về HTML "thuần"
 * (pre>code, blockquote, p>strong…) để Turndown chuyển sang Markdown cho đúng.
 * Mọi hàm đều sửa trực tiếp trên bản clone, không đụng vào DOM thật của trang.
 */

const text = (el: Element | null | undefined) => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

export function removeAll(root: Element, selectors: string[]) {
  if (!selectors.length) return;
  for (const el of root.querySelectorAll(selectors.join(","))) el.remove();
}

/** Lấy tên ngôn ngữ từ class "language-xxx" / "lang-xxx" / "highlight-source-xxx" hoặc data-language. */
export function languageOf(...els: Array<Element | null | undefined>): string {
  for (const el of els) {
    if (!el) continue;
    const data = el.getAttribute("data-language") ?? el.getAttribute("data-lang");
    if (data && data !== "plaintext" && data !== "text") return data;
    const m = /(?:^|\s)(?:language|lang|highlight-source)-([\w+#.-]+)/.exec(el.className);
    if (m && m[1] !== "plaintext" && m[1] !== "text") return m[1];
  }
  return "";
}

/** Ghép text của từng dòng code (nhiều theme render mỗi dòng là một div, không có "\n"). */
export function codeText(container: Element, lineSelector?: string): string {
  const lines = lineSelector ? [...container.querySelectorAll(lineSelector)] : [];
  const raw = lines.length
    ? lines.map((line) => line.textContent ?? "").join("\n")
    : (container.querySelector("code") ?? container).textContent ?? "";
  return raw.replace(/​/g, "").replace(/\n+$/, "");
}

/** Tạo <pre><code class="language-xxx"> chuẩn — dạng Turndown nhận ra là fenced code block. */
export function makeCodeBlock(doc: Document, code: string, lang: string, title?: string): DocumentFragment {
  const frag = doc.createDocumentFragment();
  if (title) {
    const p = doc.createElement("p");
    const c = doc.createElement("code");
    c.textContent = title;
    p.append(c);
    frag.append(p);
  }
  const pre = doc.createElement("pre");
  const el = doc.createElement("code");
  if (lang) el.className = `language-${lang}`;
  el.textContent = code;
  pre.append(el);
  frag.append(pre);
  return frag;
}

/** Callout / admonition -> blockquote có dòng tiêu đề in đậm. */
export function makeCallout(doc: Document, title: string, content: Element | null): HTMLQuoteElement {
  const quote = doc.createElement("blockquote");
  if (title) {
    const p = doc.createElement("p");
    const strong = doc.createElement("strong");
    strong.textContent = title;
    p.append(strong);
    quote.append(p);
  }
  if (content) quote.append(...content.childNodes);
  return quote;
}

/** Tabs -> lần lượt "**Nhãn tab**" + nội dung tab (giữ cả tab đang ẩn). */
export function makeTabs(doc: Document, tabs: Array<{ label: string; panel: Element | null }>): DocumentFragment {
  const frag = doc.createDocumentFragment();
  for (const { label, panel } of tabs) {
    if (!panel) continue;
    if (label) {
      const p = doc.createElement("p");
      const strong = doc.createElement("strong");
      strong.textContent = label;
      p.append(strong);
      frag.append(p);
    }
    frag.append(...panel.childNodes);
  }
  return frag;
}

/** <details><summary>X</summary>…</details> -> "**X**" + nội dung. */
export function flattenDetails(root: Element) {
  const doc = root.ownerDocument;
  for (const details of [...root.querySelectorAll("details")].reverse()) {
    const summary = details.querySelector(":scope > summary");
    const frag = doc.createDocumentFragment();
    if (summary) {
      const p = doc.createElement("p");
      const strong = doc.createElement("strong");
      strong.textContent = text(summary);
      p.append(strong);
      frag.append(p);
      summary.remove();
    }
    frag.append(...details.childNodes);
    details.replaceWith(frag);
  }
}

/**
 * Chuẩn hoá mọi <pre> còn lại (sau khi adapter đã xử lý phần riêng):
 * lấy text thuần, gắn ngôn ngữ nếu tìm được.
 */
export function normalizePre(root: Element) {
  const doc = root.ownerDocument;
  for (const pre of root.querySelectorAll("pre")) {
    const code = pre.querySelector("code");
    const lang = languageOf(code, pre, pre.parentElement, pre.parentElement?.parentElement);
    pre.replaceWith(makeCodeBlock(doc, codeText(pre), lang));
  }
}

/** Đường dẫn tương đối -> tuyệt đối theo trang gốc; ảnh lazy-load lấy từ data-src. */
export function absolutizeUrls(root: Element) {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const href = a.getAttribute("href")!;
    if (!href.startsWith("#") && !/^(javascript|mailto|tel):/i.test(href)) a.setAttribute("href", a.href);
  }
  for (const img of root.querySelectorAll<HTMLImageElement>("img")) {
    const src = img.getAttribute("data-src") ?? img.getAttribute("src");
    if (src) {
      try {
        img.setAttribute("src", new URL(src, img.baseURI).href);
      } catch {
        /* giữ nguyên */
      }
    }
    img.removeAttribute("srcset");
  }
}

export { text };
