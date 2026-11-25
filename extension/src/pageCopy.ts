/**
 * Tự bấm nút "Copy page" / "Copy as Markdown" / "Copy Markdown"… trên trang và lấy nội dung.
 *
 * Không dùng clipboard thật: khi người dùng bấm trong side panel, trang không có focus nên
 * `navigator.clipboard.writeText` của trang sẽ bị chặn. Thay vào đó ta tạm thay các API copy
 * (Clipboard.writeText / write, document.execCommand("copy")) để bắt nội dung trang định copy.
 */
export async function copyMarkdownFromPage(
  tabId: number,
  button: CopyButton = COPY_PAGE_BUTTON,
): Promise<string | undefined> {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: grabFromCopyButton,
      args: [10_000, button.label, button.selector ?? null],
    });
    const text = result?.result;
    return typeof text === "string" && text.trim() ? text.trim() : undefined;
  } catch {
    return undefined; // không có quyền / trang chặn script… -> dùng clipboard như cũ
  }
}

/** Cách nhận ra nút copy: regex (source, không phân biệt hoa thường) khớp nhãn nút, hoặc selector CSS. */
export type CopyButton = { label: string; selector?: string };

/** Nút "Copy page" / "Copy as Markdown" / "Copy for LLMs"… của các trang tài liệu. */
const COPY_PAGE_BUTTON: CopyButton = {
  label: String.raw`^copy\s+(page(\s+as\s+markdown)?|(as\s+)?markdown|for\s+llms?)$`,
};

/** Nút "Copy raw file" khi xem một file trên github.com. */
export const GITHUB_COPY_RAW_BUTTON: CopyButton = {
  label: String.raw`^copy\s+raw\s+(file|content)$`,
  selector: '[data-testid="copy-raw-button"]',
};

/** File Markdown đang xem trên github.com, vd. https://github.com/obra/superpowers/blob/main/docs/testing.md */
export const isGithubMarkdownFile = (url: string) => {
  try {
    const { hostname, pathname } = new URL(url);
    return hostname === "github.com" && /^\/[^/]+\/[^/]+\/blob\/.+\.(md|mdx|markdown)$/i.test(pathname);
  } catch {
    return false;
  }
};

/** Chạy trong trang (MAIN world) — phải tự chứa đủ, không dùng biến bên ngoài. */
async function grabFromCopyButton(
  timeoutMs: number,
  labelSource: string,
  selector: string | null,
): Promise<string | null> {
  const LABEL = new RegExp(labelSource, "i");
  // Nút có thể gồm nhiều span (vd. "Copy as Markdown" / "Copied" / "Failed" + text sr-only),
  // textContent bị dính liền nhau nên xét thêm text của từng phần tử con.
  const labelOf = (el: Element) =>
    [
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
      // GitHub: nhãn nằm ở tooltip được trỏ tới qua aria-labelledby.
      ...(el.getAttribute("aria-labelledby") ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent),
      el.textContent,
      ...[...el.querySelectorAll("*")].map((child) => child.textContent),
    ]
      .map((s) => (s ?? "").replace(/\s+/g, " ").trim())
      .find((s) => LABEL.test(s));
  const isVisible = (el: Element) => (el as HTMLElement).getClientRects().length > 0;
  const clicked = new Set<Element>();
  const findButton = () =>
    ([...document.querySelectorAll('button, [role="button"], [role="menuitem"], a')].find(
      (el) => !clicked.has(el) && isVisible(el) && labelOf(el),
    ) as HTMLElement | undefined) ??
    (selector
      ? ([...document.querySelectorAll(selector)].find((el) => !clicked.has(el) && isVisible(el)) as
          | HTMLElement
          | undefined)
      : undefined);

  const first = findButton();
  if (!first) return null;

  let captured: string | null = null;
  const capture = (text: unknown) => {
    if (typeof text === "string" && text.trim()) captured ??= text;
  };

  const proto = Clipboard.prototype;
  const origWriteText = proto.writeText;
  const origWrite = proto.write;
  const origExec = Document.prototype.execCommand;

  proto.writeText = async function (text: string) {
    capture(text);
  };
  proto.write = async function (items: ClipboardItems) {
    for (const item of items) {
      if (item.types.includes("text/plain")) {
        capture(await (await item.getType("text/plain")).text());
        return;
      }
    }
  };
  Document.prototype.execCommand = function (this: Document, cmd: string, ...rest: unknown[]) {
    if (cmd.toLowerCase() !== "copy") return origExec.call(this, cmd, ...(rest as [boolean, string]));
    // Cho các listener "copy" của trang ghi dữ liệu, sau đó lấy phần đang được chọn.
    const data = new DataTransfer();
    this.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
    const active = this.activeElement;
    const selected =
      active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement
        ? active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? undefined)
        : this.getSelection()?.toString();
    capture(data.getData("text/plain") || selected);
    return true;
  };

  try {
    clicked.add(first);
    first.click();
    const start = Date.now();
    let triedMenu = false;
    while (captured === null && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
      // Nút đầu tiên có thể chỉ mở menu — bấm tiếp mục "Copy…" vừa hiện ra.
      if (!triedMenu && captured === null && Date.now() - start > 800) {
        triedMenu = true;
        const next = findButton();
        if (next) {
          clicked.add(next);
          next.click();
        }
      }
    }
    return captured;
  } finally {
    proto.writeText = origWriteText;
    proto.write = origWrite;
    Document.prototype.execCommand = origExec;
  }
}

/**
 * Trang không có nút copy: tự chuyển HTML trong vùng nội dung sang Markdown
 * (adapter cho Starlight, Docusaurus, VitePress, MkDocs Material, còn lại dùng generic).
 */
export async function extractMarkdownFromDom(tabId: number): Promise<{ markdown: string; adapter: string } | undefined> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["extract.js"] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () =>
        (globalThis as { __websiteTranslatorExtract?: () => unknown }).__websiteTranslatorExtract?.() ?? null,
    });
    const value = result?.result as { markdown?: unknown; adapter?: unknown } | null | undefined;
    if (typeof value?.markdown !== "string" || !value.markdown.trim()) return undefined;
    return { markdown: value.markdown.trim(), adapter: String(value.adapter) };
  } catch (err) {
    console.warn("[extractMarkdownFromDom]", err);
    return undefined;
  }
}
