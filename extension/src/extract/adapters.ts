import { codeText, languageOf, makeCallout, makeCodeBlock, makeTabs, text } from "./helpers";

/**
 * Adapter cho một framework tài liệu: biết vùng nội dung chính nằm ở đâu, phần nào là
 * giao diện cần bỏ, và cách đưa component riêng (code block, callout, tabs…) về HTML thuần.
 */
export interface Adapter {
  name: string;
  detect(doc: Document): boolean;
  /** Selector vùng nội dung, thử theo thứ tự. */
  root: string[];
  /** Tiêu đề trang khi h1 nằm ngoài vùng nội dung. */
  title?(doc: Document): string | undefined;
  /** Phần tử giao diện cần bỏ trong vùng nội dung. */
  remove: string[];
  /** Chuẩn hoá component riêng — chạy trên bản clone. */
  normalize?(root: Element): void;
}

const generator = (doc: Document, name: string) =>
  [...doc.querySelectorAll('meta[name="generator"]')].some((m) =>
    (m.getAttribute("content") ?? "").toLowerCase().startsWith(name.toLowerCase()),
  );

/** Astro Starlight — vd. docs.bmad-method.org, docs.astro.build. */
const starlight: Adapter = {
  name: "starlight",
  detect: (doc) => generator(doc, "Starlight") || !!doc.querySelector(".sl-markdown-content"),
  root: ["main .sl-markdown-content", ".sl-markdown-content"],
  title: (doc) => text(doc.querySelector("h1#_top")) || undefined,
  remove: [".sl-anchor-link", ".expressive-code .copy", ".expressive-code link", ".expressive-code script"],
  normalize(root) {
    const doc = root.ownerDocument;
    // Expressive Code: mỗi dòng là div.ec-line > div.code; tên file nằm ở figcaption .title.
    for (const block of root.querySelectorAll(".expressive-code")) {
      const pre = block.querySelector("pre");
      if (!pre) continue;
      const title = text(block.querySelector("figcaption .title"));
      block.replaceWith(makeCodeBlock(doc, codeText(pre, ".ec-line .code"), languageOf(pre), title));
    }
    for (const aside of root.querySelectorAll("aside.starlight-aside")) {
      const title = text(aside.querySelector(".starlight-aside__title")) || aside.getAttribute("aria-label") || "";
      aside.replaceWith(makeCallout(doc, title, aside.querySelector(".starlight-aside__content")));
    }
    for (const tabs of [...root.querySelectorAll("starlight-tabs")].reverse()) {
      const labels = [...(tabs.querySelector('[role="tablist"]')?.querySelectorAll('[role="tab"]') ?? [])];
      const panels = [...tabs.querySelectorAll(':scope > [role="tabpanel"]')];
      tabs.replaceWith(makeTabs(doc, panels.map((panel, i) => ({ label: text(labels[i]), panel }))));
    }
    // Thẻ <a class="sl-link-card"> chứa cả tiêu đề + mô tả: giữ làm link đơn giản.
    for (const card of root.querySelectorAll("a.sl-link-card, .sl-link-card a")) {
      const title = text(card.querySelector(".title")) || text(card);
      const desc = text(card.querySelector(".description"));
      card.textContent = desc ? `${title} — ${desc}` : title;
    }
  },
};

/** Docusaurus (v2 → v4). */
const docusaurus: Adapter = {
  name: "docusaurus",
  detect: (doc) => generator(doc, "Docusaurus") || !!doc.querySelector(".theme-doc-markdown"),
  root: [".theme-doc-markdown", "article .markdown", ".markdown"],
  title: (doc) => text(doc.querySelector("article header h1, h1")) || undefined,
  remove: [
    "a.hash-link",
    ".theme-doc-toc-mobile",
    "[class*='codeLineNumber']",
    "[class*='buttonGroup']",
    "template",
  ],
  normalize(root) {
    const doc = root.ownerDocument;
    for (const block of root.querySelectorAll(".theme-code-block")) {
      const pre = block.querySelector("pre");
      if (!pre) continue;
      const title = text(block.querySelector("[class*='codeBlockTitle']"));
      block.replaceWith(makeCodeBlock(doc, codeText(pre, ".token-line"), languageOf(block, pre), title));
    }
    for (const box of root.querySelectorAll(".theme-admonition")) {
      const title = text(box.querySelector("[class*='admonitionHeading']"));
      box.replaceWith(makeCallout(doc, title, box.querySelector("[class*='admonitionContent']")));
    }
    for (const tabs of [...root.querySelectorAll(".theme-tabs-container")].reverse()) {
      const labels = [...tabs.querySelectorAll(':scope > [role="tablist"] > [role="tab"]')];
      const panels = [...tabs.querySelectorAll(':scope > div > [role="tabpanel"]')];
      tabs.replaceWith(makeTabs(doc, panels.map((panel, i) => ({ label: text(labels[i]), panel }))));
    }
  },
};

/** VitePress. */
const vitepress: Adapter = {
  name: "vitepress",
  detect: (doc) => generator(doc, "VitePress") || !!doc.querySelector(".vp-doc"),
  root: ["main .vp-doc", ".vp-doc"],
  remove: ["a.header-anchor", "button.copy", "span.lang", ".line-numbers-wrapper"],
  normalize(root) {
    const doc = root.ownerDocument;
    for (const group of [...root.querySelectorAll(".vp-code-group")].reverse()) {
      const labels = [...group.querySelectorAll(".tabs label")];
      const blocks = [...group.querySelectorAll(":scope > .blocks > *")];
      group.replaceWith(
        makeTabs(
          doc,
          blocks.map((block, i) => {
            const wrap = doc.createElement("div");
            wrap.append(block);
            return { label: text(labels[i]), panel: wrap };
          }),
        ),
      );
    }
    for (const box of root.querySelectorAll("div.custom-block")) {
      const titleEl = box.querySelector(".custom-block-title");
      const title = text(titleEl);
      titleEl?.remove();
      box.replaceWith(makeCallout(doc, title, box));
    }
  },
};

/** MkDocs Material. */
const mkdocsMaterial: Adapter = {
  name: "mkdocs-material",
  detect: (doc) => generator(doc, "mkdocs") || !!doc.querySelector(".md-content__inner"),
  root: ["article.md-content__inner", ".md-content__inner"],
  remove: ["a.headerlink", ".md-content__button", ".md-source-file", ".md-clipboard", ".linenos", ".md-feedback"],
  normalize(root) {
    const doc = root.ownerDocument;
    for (const block of root.querySelectorAll("div.highlight")) {
      const pre = block.querySelector("td.code pre, pre");
      if (!pre) continue;
      const title = text(block.querySelector(".filename"));
      block.replaceWith(makeCodeBlock(doc, codeText(pre), languageOf(block, pre), title));
    }
    for (const box of root.querySelectorAll("div.admonition")) {
      const titleEl = box.querySelector(":scope > .admonition-title");
      const title = text(titleEl);
      titleEl?.remove();
      box.replaceWith(makeCallout(doc, title, box));
    }
    for (const set of [...root.querySelectorAll(".tabbed-set")].reverse()) {
      const labels = [...set.querySelectorAll(":scope > .tabbed-labels > label, :scope > label")];
      const panels = [...set.querySelectorAll(":scope > .tabbed-content > .tabbed-block")];
      set.replaceWith(makeTabs(doc, panels.map((panel, i) => ({ label: text(labels[i]), panel }))));
    }
  },
};

/** Trang bất kỳ: lấy vùng nội dung dài nhất trong article/main, bỏ điều hướng. */
const generic: Adapter = {
  name: "generic",
  detect: () => true,
  root: ["article", "[role='main']", "main", "#content", ".content", "body"],
  remove: [
    "nav",
    "footer",
    "form",
    "dialog",
    "[role='navigation']",
    "[role='banner']",
    "[role='contentinfo']",
    "[role='search']",
    "[aria-label='breadcrumb']",
    ".breadcrumbs",
    ".toc",
    "#toc",
  ],
};

export const ADAPTERS: Adapter[] = [starlight, docusaurus, vitepress, mkdocsMaterial, generic];
