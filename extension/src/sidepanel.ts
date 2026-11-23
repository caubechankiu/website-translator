import DOMPurify from "dompurify";
import { marked } from "marked";
import { getSavedTranslation, translate, type Translation } from "./api";
import { copyMarkdownFromPage } from "./pageCopy";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  pageTitle: $("page-title"),
  translateBtn: $<HTMLButtonElement>("translate"),
  settingsBtn: $<HTMLButtonElement>("settings"),
  hint: $("hint"),
  status: $("status"),
  output: $("output"),
};

type State = {
  supported: boolean;
  /** Đang kiểm tra bản dịch đã lưu — chưa biết trang đã dịch hay chưa. */
  checking: boolean;
  translation?: Translation;
  busy?: string;
  error?: string;
};

let state: State = { supported: false, checking: true };
let activeTabId: number | undefined;
let currentTab: { id: number; url: string; title: string } | undefined;
/** Bản dịch đang chạy theo URL — giữ lại khi người dùng chuyển tab rồi quay lại. */
const inFlight = new Map<string, Promise<Translation>>();
/** Tăng mỗi lần đổi tab, để bỏ qua kết quả cũ trả về muộn. */
let generation = 0;

const isTranslatable = (url: string) => /^https?:\/\//.test(url);
/** Khoá của trang: chỉ tính đến path, bỏ ?query và #hash (giống API). */
const pageKey = (url: string) => {
  const u = new URL(url);
  return u.origin + u.pathname;
};

function setState(patch: Partial<State>) {
  state = { ...state, ...patch };
  render();
}

function renderMarkdown(markdown: string) {
  els.output.innerHTML = DOMPurify.sanitize(marked.parse(markdown, { async: false }));
  // Link trong bản dịch mở ở tab mới thay vì điều hướng side panel.
  for (const a of els.output.querySelectorAll("a")) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
}

function render() {
  const { supported, checking, translation, busy, error } = state;
  const showButton = supported && !checking;

  els.translateBtn.hidden = !showButton;
  els.hint.hidden = !showButton;
  els.translateBtn.disabled = !!busy;
  els.translateBtn.textContent = translation ? "Dịch lại" : "Dịch trang này";
  els.output.hidden = !translation;

  let message = "";
  let kind = "";
  if (!supported) message = "Chỉ dịch được trang http/https.";
  else if (busy) [message, kind] = [busy, "loading"];
  else if (checking) [message, kind] = ["Đang kiểm tra bản dịch đã lưu…", "loading"];
  else if (error) [message, kind] = [error, "error"];
  else if (translation) {
    const at = new Date(translation.translatedAt).toLocaleString("vi-VN");
    message = `Dịch lúc ${at}`;
  } else message = "Trang này chưa được dịch.";
  els.status.textContent = message;
  els.status.className = `status ${kind}`;
}

async function track(job: Promise<Translation>, gen: number) {
  try {
    const translation = await job;
    if (gen !== generation) return;
    renderMarkdown(translation.translatedContent);
    els.output.scrollTop = 0;
    setState({ translation, busy: undefined, error: undefined });
  } catch (err) {
    if (gen === generation) setState({ busy: undefined, error: (err as Error).message });
  }
}

async function loadActiveTab() {
  const gen = ++generation;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (gen !== generation) return;
  activeTabId = tab?.id;
  els.pageTitle.textContent = tab?.title ?? "";

  if (!tab?.id || !tab.url || !isTranslatable(tab.url)) {
    currentTab = undefined;
    state = { supported: false, checking: false };
    return render();
  }
  currentTab = { id: tab.id, url: tab.url, title: tab.title ?? tab.url };
  state = { supported: true, checking: true };
  render();

  try {
    const saved = await getSavedTranslation(tab.url);
    if (gen !== generation) return;
    if (saved) renderMarkdown(saved.translatedContent);
    els.output.scrollTop = 0;
    setState({ checking: false, translation: saved });
  } catch (err) {
    if (gen === generation) setState({ checking: false, error: (err as Error).message });
  }

  const pending = inFlight.get(pageKey(tab.url));
  if (pending && gen === generation) {
    setState({ busy: "Đang dịch… (có thể mất vài phút)" });
    track(pending, gen);
  }
}

async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    throw new Error("Không đọc được clipboard — hãy cho phép extension truy cập clipboard.");
  }
}

/** Xoá clipboard sau khi đã lấy nội dung; lỗi thì bỏ qua, không chặn việc dịch. */
async function clearClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText("");
  } catch {
    /* không xoá được thì thôi */
  }
}

/** Cú pháp Markdown thường gặp; chỉ cần khớp một mẫu là coi như Markdown. */
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m, // tiêu đề
  /^\s*[-*+]\s+\S/m, // danh sách
  /^\s*\d+[.)]\s+\S/m, // danh sách đánh số
  /^>\s?\S/m, // trích dẫn
  /^(```|~~~)/m, // code block
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m, // dòng phân cách bảng
  /!?\[[^\]\n]*\]\([^)\s]+(\s+"[^"]*")?\)/, // link / ảnh
  /^\[[^\]\n]+\]:\s*\S+/m, // định nghĩa reference link
  /(\*\*|__)\S(.*?\S)?\1/, // in đậm
  /`[^`\n]+`/, // inline code
  /^(-{3,}|\*{3,}|_{3,})\s*$/m, // đường kẻ ngang / frontmatter
];

function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trimStart();
  // Mã HTML hoặc JSON copy nhầm thì không phải Markdown.
  if (/^<(!doctype|html|head|body|div|span|p|script)\b/i.test(trimmed)) return false;
  if (/^[{[]/.test(trimmed)) {
    try {
      JSON.parse(text);
      return false;
    } catch {
      /* không phải JSON */
    }
  }
  return MARKDOWN_PATTERNS.some((re) => re.test(text));
}

async function startTranslation() {
  if (!currentTab) return;
  const { id: tabId, url } = currentTab;
  const key = pageKey(url);
  if (inFlight.has(key)) return;

  // Phải gọi ngay trong lúc bấm nút (trước mọi await) thì Chrome mới cho hỏi quyền.
  // Đã cấp rồi thì trả về true luôn, không hỏi lại.
  const hostAccess = chrome.permissions
    .request({ origins: ["http://*/*", "https://*/*"] })
    .catch(() => false);

  const gen = generation;
  // "Dịch lại" luôn gọi Claude, kể cả khi nội dung trùng bản đã lưu.
  const force = !!state.translation;
  /** Chỉ cập nhật giao diện nếu người dùng vẫn ở trang này. */
  const update = (patch: Partial<State>) => gen === generation && setState(patch);

  setState({ busy: "Đang lấy nội dung trang…", error: undefined });
  // Ưu tiên tự bấm nút "Copy page" / "Copy Markdown" của trang; không được thì đọc clipboard.
  let content = (await hostAccess) ? await copyMarkdownFromPage(tabId) : undefined;
  if (content && !looksLikeMarkdown(content)) content = undefined;
  if (!content) {
    try {
      content = await readClipboard();
    } catch (err) {
      return void update({ busy: undefined, error: (err as Error).message });
    }
  }
  if (!content) {
    return void update({ busy: undefined, error: "Clipboard trống — hãy copy nội dung Markdown của trang rồi bấm lại." });
  }
  if (!looksLikeMarkdown(content)) {
    return void update({
      busy: undefined,
      error: "Nội dung trong clipboard không phải Markdown — hãy copy nội dung Markdown của trang rồi bấm lại.",
    });
  }

  void clearClipboard();

  const job = translate(url, content, force);
  inFlight.set(key, job);
  job.finally(() => inFlight.delete(key)).catch(() => {});

  update({ busy: "Đang dịch… (có thể mất vài phút)", error: undefined });
  await track(job, gen);
}

els.translateBtn.addEventListener("click", startTranslation);
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.tabs.onActivated.addListener(() => loadActiveTab());
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId !== activeTabId) return;
  if (info.title) els.pageTitle.textContent = info.title;
  // Chỉ tải lại khi sang trang khác (bỏ qua đổi ?query / #hash).
  if (!info.url || (currentTab && pageKey(info.url) === pageKey(currentTab.url))) return;
  loadActiveTab();
});
chrome.storage.onChanged.addListener(() => loadActiveTab());

loadActiveTab();
