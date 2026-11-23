/**
 * PWA chỉ để XEM bản dịch đã lưu — dùng trên Android qua menu Chia sẻ của Chrome.
 * Trang chưa dịch thì chỉ báo, không dịch (việc dịch làm bằng extension trên máy tính).
 * API ở domain khác (API_URL lúc build); API bật CORS cho mọi origin.
 */
import { renderMarkdown } from "../../shared/render";

declare const __API_URL__: string;

type Translation = { url: string; translatedContent: string; translatedAt: string };

const SECRET_KEY = "secret";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  title: $("page-title"),
  link: $<HTMLAnchorElement>("page-link"),
  status: $("status"),
  settings: $<HTMLButtonElement>("settings"),
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

function setStatus(message: string, kind: "" | "loading" | "error" = "") {
  els.status.textContent = message;
  els.status.className = `status ${kind}`;
}

function show(view: "secret" | "url" | "output" | "none") {
  els.secretForm.hidden = view !== "secret";
  els.urlForm.hidden = view !== "url";
  els.output.hidden = view !== "output";
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
  renderMarkdown(els.output, translation.translatedContent, url);
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
  const { url, title } = currentPage();
  if (!url) {
    els.title.textContent = "Website Translator";
    els.link.hidden = true;
    setStatus("");
    show(storage.get() ? "url" : "secret");
    return;
  }
  // Chuẩn hoá query về ?url=&title= để tải lại / quay lại vẫn đúng trang.
  const clean = new URLSearchParams({ url });
  if (title) clean.set("title", title);
  history.replaceState(null, "", `/?${clean}`);
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

window.addEventListener("popstate", route);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("[sw]", err));
}

route();
