/**
 * PWA chỉ để XEM bản dịch đã lưu — dùng trên Android qua menu Chia sẻ của Chrome.
 * Trang chưa dịch thì chỉ báo, không dịch (việc dịch làm bằng extension trên máy tính).
 * API ở domain khác (API_URL lúc build); API bật CORS cho mọi origin.
 */
import { renderMarkdown, type Anchor } from "../../shared/render";

declare const __API_URL__: string;

type Translation = { url: string; translatedContent: string; translatedAt: string; anchors?: Anchor[] };

const SECRET_KEY = "secret";
const HISTORY_KEY = "history";
const HISTORY_LIMIT = 300;

type HistoryEntry = { url: string; title?: string; visitedAt: number };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  title: $("page-title"),
  link: $<HTMLAnchorElement>("page-link"),
  status: $("status"),
  settings: $<HTMLButtonElement>("settings"),
  historyView: $("history-view"),
  historyList: $("history-list"),
  historyEmpty: $("history-empty"),
  historyClear: $<HTMLButtonElement>("history-clear"),
  secretForm: $<HTMLFormElement>("secret-form"),
  secretInput: $<HTMLInputElement>("secret-input"),
  urlForm: $<HTMLFormElement>("url-form"),
  urlInput: $<HTMLInputElement>("url-input"),
  output: $("output"),
};

const storage = {
  get(): string {
    try {
      return localStorage.getItem(SECRET_KEY) ?? "";
    } catch {
      return "";
    }
  },
  set(value: string) {
    try {
      localStorage.setItem(SECRET_KEY, value);
    } catch {
      /* chế độ ẩn danh / bị chặn lưu trữ */
    }
  },
};

/** Lịch sử chỉ lưu trên máy này (localStorage), mới nhất đứng đầu, mỗi URL một dòng. */
const history_ = {
  get(): HistoryEntry[] {
    try {
      const list = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  },
  save(list: HistoryEntry[]) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
    } catch {
      /* chế độ ẩn danh / bị chặn lưu trữ */
    }
  },
  add(url: string, title?: string) {
    const old = this.get();
    const prev = old.find((e) => e.url === url);
    const entry = { url, title: title || prev?.title, visitedAt: Date.now() };
    this.save([entry, ...old.filter((e) => e.url !== url)]);
  },
  remove(url: string) {
    this.save(this.get().filter((e) => e.url !== url));
  },
};

function setStatus(message: string, kind: "" | "loading" | "error" = "") {
  els.status.textContent = message;
  els.status.className = `status ${kind}`;
}

function show(view: "secret" | "url" | "output" | "history" | "none") {
  els.secretForm.hidden = view !== "secret";
  els.urlForm.hidden = view !== "url";
  els.output.hidden = view !== "output";
  els.historyView.hidden = view !== "history";
}

const pageHref = (url: string, title?: string) => {
  const params = new URLSearchParams({ url });
  if (title) params.set("title", title);
  return `/?${params}`;
};

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Hôm nay ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Hôm qua ${time}`;
  return `${d.toLocaleDateString("vi-VN")} ${time}`;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

/** Nhóm theo domain; nhóm nào có trang xem gần nhất thì đứng trước (list đã sắp mới → cũ). */
function renderHistory() {
  const list = history_.get();
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of list) {
    const host = new URL(entry.url).hostname;
    groups.set(host, [...(groups.get(host) ?? []), entry]);
  }

  els.historyList.replaceChildren(
    ...[...groups].map(([host, entries]) => {
      const group = el("details", "history-group");
      group.open = true;
      const summary = el("summary", undefined, host);
      summary.append(el("span", "count", String(entries.length)));
      const ul = el("ul");
      for (const entry of entries) {
        const u = new URL(entry.url);
        const li = el("li", "history-item");
        const a = el("a");
        a.href = pageHref(entry.url, entry.title);
        a.append(
          el("span", "item-title", entry.title || u.pathname),
          el("span", "item-meta", `${formatTime(entry.visitedAt)} · ${u.pathname}`),
        );
        const del = el("button", "icon", "×");
        del.type = "button";
        del.title = del.ariaLabel = "Xoá khỏi lịch sử";
        del.dataset.url = entry.url;
        li.append(a, del);
        ul.append(li);
      }
      group.append(summary, ul);
      return group;
    }),
  );
  els.historyEmpty.hidden = list.length > 0;
  els.historyClear.hidden = list.length === 0;
}

function showHistory() {
  els.title.textContent = "Lịch sử";
  els.link.hidden = true;
  document.title = "Lịch sử — Website Translator";
  setStatus("");
  renderHistory();
  show("history");
  window.scrollTo(0, 0);
}

/**
 * Chrome Android khi Chia sẻ thường để link trong `text` (kèm tiêu đề) thay vì `url`,
 * nên lấy link http(s) đầu tiên tìm được.
 */
function findUrl(...candidates: (string | null)[]): string | undefined {
  for (const value of candidates) {
    const match = value?.match(/https?:\/\/[^\s<>"]+/);
    if (match) return match[0];
  }
}

function showPage(url: string, title?: string) {
  const u = new URL(url);
  els.title.textContent = title || u.hostname;
  els.link.textContent = u.hostname + u.pathname;
  els.link.href = url;
  els.link.hidden = false;
  document.title = title ? `${title} — Dịch trang` : "Website Translator";
}

async function load(url: string, title?: string) {
  showPage(url, title);
  const secret = storage.get();
  if (!secret) {
    setStatus("Nhập SECRET để xem bản dịch.");
    return show("secret");
  }

  show("none");
  setStatus("Đang tải bản dịch…", "loading");
  let res: Response;
  try {
    res = await fetch(`${__API_URL__}/api/websites?url=${encodeURIComponent(url)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch {
    return setStatus("Không kết nối được máy chủ.", "error");
  }

  if (res.status === 401) {
    setStatus("SECRET không đúng.", "error");
    return show("secret");
  }
  if (res.status === 404) return setStatus("Trang này chưa được dịch.");
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return setStatus(body.error ?? `Lỗi HTTP ${res.status}`, "error");

  const translation = body as Translation;
  renderMarkdown(els.output, translation.translatedContent, url, translation.anchors);
  // Lưu theo URL đã chuẩn hoá của API (bỏ ?query/#hash) để cùng một trang không bị lặp.
  history_.add(translation.url, title);
  show("output");
  window.scrollTo(0, 0);
  setStatus(`Dịch lúc ${new Date(translation.translatedAt).toLocaleString("vi-VN")}`);
}

/** Trang đang xem, lấy từ query (?url= do Chia sẻ hoặc do chính app ghi lại). */
function currentPage(): { url?: string; title?: string } {
  const params = new URLSearchParams(location.search);
  const url = findUrl(params.get("url"), params.get("text"));
  // Khi Chia sẻ, `text` thường là "Tiêu đề https://…" — bỏ link đi để lấy tiêu đề.
  const title =
    params.get("title")?.trim() ||
    params.get("text")?.replace(/https?:\/\/\S+/g, "").trim() ||
    undefined;
  return { url, title };
}

function route() {
  if (inHistory()) return showHistory();
  const { url, title } = currentPage();
  if (!url) {
    els.title.textContent = "Website Translator";
    els.link.hidden = true;
    setStatus("");
    show(storage.get() ? "url" : "secret");
    return;
  }
  // Chuẩn hoá query về ?url=&title= để tải lại / quay lại vẫn đúng trang.
  history.replaceState(null, "", pageHref(url, title));
  load(url, title);
}

els.secretForm.addEventListener("submit", (e) => {
  e.preventDefault();
  storage.set(els.secretInput.value.trim());
  els.secretInput.value = "";
  route();
});

els.urlForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const url = findUrl(els.urlInput.value);
  if (!url) return setStatus("Link không hợp lệ.", "error");
  els.urlInput.value = "";
  history.pushState(null, "", `/?${new URLSearchParams({ url })}`);
  route();
});

els.settings.addEventListener("click", () => {
  els.secretInput.value = storage.get();
  setStatus("Đổi SECRET:");
  show("secret");
});

const inHistory = () => new URLSearchParams(location.search).has("history");

/**
 * Vuốt ngang (trái→phải hoặc phải→trái) ở giữa màn hình: mở Lịch sử; đang ở Lịch sử thì quay lại.
 * Bỏ qua vùng sát mép (Android dùng cho cử chỉ Back), ô nhập và vùng cuộn ngang (khối code, bảng).
 */
const SWIPE = { minDistance: 80, maxDuration: 600, edge: 32 };
let swipeStart: { x: number; y: number; t: number } | undefined;

function scrollsHorizontally(target: EventTarget | null): boolean {
  for (let node = target as HTMLElement | null; node && node !== document.body; node = node.parentElement) {
    if (node.matches("input, textarea")) return true;
    const { overflowX } = getComputedStyle(node);
    if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth) return true;
  }
  return false;
}

document.addEventListener(
  "touchstart",
  (e) => {
    const t = e.touches[0];
    const nearEdge = t.clientX < SWIPE.edge || t.clientX > window.innerWidth - SWIPE.edge;
    swipeStart =
      e.touches.length === 1 && !nearEdge && !scrollsHorizontally(e.target)
        ? { x: t.clientX, y: t.clientY, t: Date.now() }
        : undefined;
  },
  { passive: true },
);

document.addEventListener(
  "touchend",
  (e) => {
    if (!swipeStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    const fast = Date.now() - swipeStart.t <= SWIPE.maxDuration;
    swipeStart = undefined;
    if (!fast || Math.abs(dx) < SWIPE.minDistance || Math.abs(dx) < 2 * Math.abs(dy)) return;
    // Đang chọn chữ thì không coi là vuốt.
    if (getSelection()?.toString()) return;

    if (!inHistory()) {
      history.pushState({ openedBySwipe: true }, "", "/?history");
      route();
    } else if (history.state?.openedBySwipe) {
      history.back();
    } else {
      // Mở thẳng bằng link ?history: không có trang trước trong app để quay về.
      history.replaceState(null, "", "/");
      route();
    }
  },
  { passive: true },
);
document.addEventListener("touchcancel", () => (swipeStart = undefined), { passive: true });

els.historyList.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const del = target.closest<HTMLButtonElement>("button[data-url]");
  if (del) {
    history_.remove(del.dataset.url!);
    return renderHistory();
  }
  const link = target.closest("a");
  if (link) {
    // Điều hướng trong app (không tải lại trang); Back quay về Lịch sử.
    e.preventDefault();
    history.pushState(null, "", link.getAttribute("href")!);
    route();
  }
});

els.historyClear.addEventListener("click", () => {
  if (!confirm("Xoá toàn bộ lịch sử?")) return;
  history_.save([]);
  renderHistory();
});

window.addEventListener("popstate", route);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw]", err));
}

route();
