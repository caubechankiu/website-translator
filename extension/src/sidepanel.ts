import { renderMarkdown as renderInto, scrollToAnchor } from "../../shared/render";
import { imageProxyUrl, getSavedTranslation, translate, type Translation } from "./api";
import {
  copyMarkdownFromPage,
  extractMarkdownFromDom,
  GITHUB_COPY_RAW_BUTTON,
  isGithubMarkdownFile,
} from "./pageCopy";
import { createScrollSync, toggleScrollSync, type SyncStatus } from "./scrollSync/panel";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  pageTitle: $("page-title"),
  translateBtn: $<HTMLButtonElement>("translate"),
  settingsBtn: $<HTMLButtonElement>("settings"),
  syncBtn: $<HTMLButtonElement>("sync"),
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
/** Panel gắn cố định với tab đã mở nó (truyền qua ?tabId=). */
const activeTabId = Number(new URLSearchParams(location.search).get("tabId")) || undefined;
let currentTab: { id: number; url: string; title: string } | undefined;
/** Bản dịch đang chạy theo URL — giữ lại khi người dùng chuyển tab rồi quay lại. */
const inFlight = new Map<string, { job: Promise<Translation>; source: string }>();

/** Tên hiển thị của adapter chuyển HTML -> Markdown (xem src/extract/adapters.ts). */
const ADAPTER_LABELS: Record<string, string> = {
  starlight: "Starlight (Astro)",
  docusaurus: "Docusaurus",
  vitepress: "VitePress",
  "mkdocs-material": "MkDocs Material",
  generic: "generic",
};

const translatingMessage = (source: string) => `Đang dịch… (có thể mất vài phút)\nNguồn Markdown: ${source}`;
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

function renderTranslation(translation: Translation, baseUrl: string) {
  renderInto(els.output, translation.translatedContent, baseUrl, {
    anchors: translation.anchors,
    onNavigate: openInTab,
    onAnchor: scrollTabToAnchor,
    proxyImage: imageProxyUrl,
  });
}

/** Đồng bộ cuộn bản dịch với trang gốc theo tiêu đề (xem scrollSync/). */
let syncStatus: SyncStatus = { kind: "idle" };
const SYNC_TITLES: Record<SyncStatus["kind"], (n: number) => string> = {
  off: () => "Đồng bộ cuộn: đang tắt — bấm để bật",
  idle: () => "Đồng bộ cuộn với trang gốc theo tiêu đề",
  "no-permission": () => "Đồng bộ cuộn: cần quyền truy cập trang — bấm để cấp quyền",
  connecting: () => "Đồng bộ cuộn: đang kết nối với trang…",
  unavailable: () => "Đồng bộ cuộn: không chạy được trên trang này",
  few: (n) => `Đồng bộ cuộn: chỉ khớp ${n} tiêu đề với trang gốc, không đủ để đồng bộ`,
  on: (n) => `Đồng bộ cuộn: đang bật (khớp ${n} tiêu đề) — bấm để tắt`,
};
const scrollSync = createScrollSync(els.output, (status) => {
  syncStatus = status;
  const count = "count" in status ? status.count : 0;
  els.syncBtn.title = els.syncBtn.ariaLabel = SYNC_TITLES[status.kind](count);
  els.syncBtn.dataset.state = status.kind;
  els.syncBtn.setAttribute("aria-pressed", String(status.kind === "on"));
});

function startScrollSync() {
  if (currentTab && state.translation) void scrollSync.start(currentTab.id);
  else scrollSync.stop();
}

/**
 * Bấm link "#…" trong bản dịch: cuộn luôn trang gốc trong tab tới mục đó.
 * Id tiêu đề trong bản dịch lấy từ trang gốc nên trỏ cùng một chỗ. Chỉ đổi #hash của URL
 * (trình duyệt tự cuộn, không tải lại trang) nên không cần quyền truy cập trang.
 */
function scrollTabToAnchor(hash: string) {
  if (!currentTab) return;
  const url = new URL(currentTab.url);
  url.hash = hash;
  chrome.tabs.update(currentTab.id, { url: url.href }).catch((err) => console.warn("[scrollTabToAnchor]", err));
}

/**
 * Bấm link tới trang khác cùng site: chuyển tab đang gắn panel sang trang đó.
 * Panel tự tải bản dịch khi tab đổi trang (chrome.tabs.onUpdated), nên trang gốc và bản dịch luôn khớp nhau.
 */
function openInTab(url: string) {
  const tabId = activeTabId ?? currentTab?.id;
  if (tabId === undefined) return void window.open(url, "_blank", "noopener");
  chrome.tabs.update(tabId, { url }).catch((err) => setState({ error: (err as Error).message }));
}

function render() {
  const { supported, checking, translation, busy, error } = state;
  const showButton = supported && !checking;

  els.translateBtn.hidden = !showButton;
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
    renderTranslation(translation, currentTab?.url ?? location.href);
    els.output.scrollTop = 0;
    setState({ translation, busy: undefined, error: undefined });
    startScrollSync();
  } catch (err) {
    if (gen === generation) setState({ busy: undefined, error: (err as Error).message });
  }
}

async function loadActiveTab() {
  const gen = ++generation;
  const tab = activeTabId
    ? await chrome.tabs.get(activeTabId).catch(() => undefined)
    : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (gen !== generation) return;
  els.pageTitle.textContent = tab?.title ?? "";
  els.pageTitle.title = tab?.title ?? "";

  if (!tab?.id || !tab.url || !isTranslatable(tab.url)) {
    currentTab = undefined;
    state = { supported: false, checking: false };
    scrollSync.stop();
    return render();
  }
  currentTab = { id: tab.id, url: tab.url, title: tab.title ?? tab.url };
  state = { supported: true, checking: true };
  render();
  scrollSync.stop();

  try {
    const saved = await getSavedTranslation(tab.url);
    if (gen !== generation) return;
    if (saved) renderTranslation(saved, tab.url);
    els.output.scrollTop = 0;
    setState({ checking: false, translation: saved });
    // URL có #hash (vd. bấm link "/docs/cli#openspec-init" từ trang trước) thì cuộn tới mục đó.
    if (saved) scrollToAnchor(els.output, new URL(tab.url).hash, "auto");
    startScrollSync();
  } catch (err) {
    if (gen === generation) setState({ checking: false, error: (err as Error).message });
  }

  const pending = inFlight.get(pageKey(tab.url));
  if (pending && gen === generation) {
    setState({ busy: translatingMessage(pending.source) });
    track(pending.job, gen);
  }
}

async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()).trim();
  } catch {
    throw new Error("Không đọc được clipboard — hãy cho phép extension truy cập clipboard.");
  }
}

/** Ghi đè clipboard qua sự kiện "copy" — dùng khi writeText("") bị Chrome bỏ qua. */
function overwriteViaCopyEvent(text: string) {
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/plain", text);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy, { once: true });
  try {
    document.execCommand("copy");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}

async function isClipboardCleared(): Promise<boolean> {
  try {
    return !(await navigator.clipboard.readText()).trim();
  } catch {
    return false;
  }
}

/**
 * Xoá clipboard sau khi đã lấy nội dung; không chặn việc dịch.
 * Chrome chỉ cho ghi clipboard khi panel đang có focus, nên nếu mất focus thì đợi focus lại.
 */
async function clearClipboard(): Promise<void> {
  if (!document.hasFocus()) {
    await new Promise((r) => window.addEventListener("focus", r, { once: true }));
  }
  const attempts: Array<() => unknown> = [
    () => navigator.clipboard.writeText(""),
    () => overwriteViaCopyEvent(""),
    // Phương án cuối: không xoá trống được thì ít nhất ghi đè nội dung cũ.
    () => navigator.clipboard.writeText(" "),
  ];
  for (const attempt of attempts) {
    try {
      await attempt();
    } catch (err) {
      console.warn("[clearClipboard]", err);
    }
    if (await isClipboardCleared()) return;
  }
  console.warn("[clearClipboard] Không xoá được clipboard.");
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
  const canAccessPage = await hostAccess;
  let content: string | undefined;
  let source = "nút Copy của trang";
  // 0. File Markdown trên github.com: bấm nút "Copy raw file" để lấy nguyên văn file .md
  //    (không kiểm tra looksLikeMarkdown — file .md có thể chỉ là văn bản thuần).
  if (canAccessPage && isGithubMarkdownFile(url)) {
    content = await copyMarkdownFromPage(tabId, GITHUB_COPY_RAW_BUTTON);
    if (content) source = "nút Copy raw file của GitHub";
  }
  // 1. Tự bấm nút "Copy page" / "Copy Markdown" của trang.
  if (!content && canAccessPage) {
    content = await copyMarkdownFromPage(tabId);
    if (content && !looksLikeMarkdown(content)) content = undefined;
  }

  // 2. Clipboard — sau mỗi lần dịch clipboard đã bị xoá, nên còn Markdown nghĩa là người dùng vừa tự copy.
  let clipboardError: string | undefined;
  if (!content) {
    try {
      const clip = await readClipboard();
      if (clip && looksLikeMarkdown(clip)) {
        content = clip;
        source = "clipboard";
        void clearClipboard();
      }
    } catch (err) {
      clipboardError = (err as Error).message;
    }
  }

  // 3. Tự chuyển HTML của trang sang Markdown theo framework (Starlight, Docusaurus…).
  if (!content && canAccessPage) {
    const extracted = await extractMarkdownFromDom(tabId);
    if (extracted) {
      content = extracted.markdown;
      source = `chuyển từ HTML — adapter ${ADAPTER_LABELS[extracted.adapter] ?? extracted.adapter}`;
    }
  }

  if (!content) {
    return void update({
      busy: undefined,
      error:
        clipboardError ??
        "Không lấy được nội dung trang — hãy copy nội dung Markdown của trang rồi bấm lại.",
    });
  }

  const job = translate(url, content, force);
  inFlight.set(key, { job, source });
  job.finally(() => inFlight.delete(key)).catch(() => {});

  update({ busy: translatingMessage(source), error: undefined });
  await track(job, gen);
}

els.translateBtn.addEventListener("click", startTranslation);
els.settingsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());
// Không await trước toggleScrollSync: xin quyền phải nằm ngay trong user gesture.
els.syncBtn.addEventListener("click", () => void toggleScrollSync(syncStatus));

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId !== activeTabId) return;
  // Trang tải xong (kể cả tải lại): content script cũ đã mất, kết nối lại đồng bộ cuộn.
  if (info.status === "complete" && !info.url && state.translation) startScrollSync();
  if (info.title) els.pageTitle.textContent = els.pageTitle.title = info.title;
  // Chỉ tải lại khi sang trang khác (bỏ qua đổi ?query / #hash).
  if (!info.url || (currentTab && pageKey(info.url) === pageKey(currentTab.url))) return;
  loadActiveTab();
});
chrome.storage.onChanged.addListener((changes) => {
  if ("apiUrl" in changes || "secret" in changes) loadActiveTab();
  else if ("scrollSync" in changes) startScrollSync();
});
// Cấp quyền truy cập trang (nút đồng bộ, hoặc khi bấm "Dịch trang này") thì thử đồng bộ lại.
chrome.permissions.onAdded.addListener(() => startScrollSync());

loadActiveTab();
