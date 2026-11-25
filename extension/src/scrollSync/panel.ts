/**
 * Phía side panel của đồng bộ cuộn: inject content script vào tab, mở port, trao đổi danh sách tiêu đề
 * rồi gửi / nhận vị trí cuộn. Xem scrollSync/core.ts cho cách tính vị trí.
 */
import { applyPos, elementView, locate, PORT_NAME, watchUserScroll, type SyncMessage } from "./core";

/** Cần ít nhất ngần này tiêu đề chung thì mới đồng bộ — ít hơn thì chỉ đúng ở đầu / cuối trang, dễ lệch. */
const MIN_HEADINGS = 2;

export type SyncStatus =
  | { kind: "off" } // người dùng tắt
  | { kind: "idle" } // chưa có bản dịch
  | { kind: "no-permission" }
  | { kind: "connecting" }
  | { kind: "unavailable" } // không inject được (trang của Chrome, Web Store…)
  | { kind: "few"; count: number }
  | { kind: "on"; count: number };

const HOST_ORIGINS = ["http://*/*", "https://*/*"];

export function createScrollSync(container: HTMLElement, onStatus: (status: SyncStatus) => void) {
  const view = elementView(container);
  let port: chrome.runtime.Port | undefined;
  let stopWatching: (() => void) | undefined;
  /** Tăng mỗi lần start/stop để bỏ qua kết quả của lần start cũ. */
  let session = 0;

  function stop(status: SyncStatus = { kind: "idle" }) {
    session++;
    stopWatching?.();
    stopWatching = undefined;
    port?.disconnect();
    port = undefined;
    onStatus(status);
  }

  /** Bắt đầu (lại) đồng bộ bản dịch đang hiển thị trong `container` với trang trong tab. */
  async function start(tabId: number) {
    stop({ kind: "connecting" });
    const current = session;
    const { scrollSync } = await chrome.storage.local.get({ scrollSync: true });
    if (current !== session) return;
    if (!scrollSync) return stop({ kind: "off" });
    if (!(await chrome.permissions.contains({ origins: HOST_ORIGINS }))) return stop({ kind: "no-permission" });

    const ids = [...container.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")].map(
      (h) => h.id,
    );
    if (ids.length < MIN_HEADINGS) return stop({ kind: "few", count: ids.length });

    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["scrollSync.js"] });
    } catch {
      if (current === session) stop({ kind: "unavailable" });
      return;
    }
    if (current !== session) return;

    const elements = new Map(
      ids.map((id) => [id, container.querySelector(`[id="${CSS.escape(id)}"]`)] as const),
    );
    const lookup = (id: string) => elements.get(id);
    let keys: string[] = [];

    port = chrome.tabs.connect(tabId, { name: PORT_NAME, frameId: 0 });
    const send = (msg: SyncMessage) => {
      try {
        port?.postMessage(msg);
      } catch {
        /* port đã đóng */
      }
    };
    port.onMessage.addListener((msg: SyncMessage) => {
      if (current !== session) return;
      if (msg.type === "ready") {
        keys = msg.ids;
        stopWatching?.();
        stopWatching = undefined;
        if (keys.length < MIN_HEADINGS) return onStatus({ kind: "few", count: keys.length });
        stopWatching = watchUserScroll(view, () => send({ type: "scroll", pos: locate(view, keys, lookup) }));
        onStatus({ kind: "on", count: keys.length });
      } else if (msg.type === "scroll" && keys.length >= MIN_HEADINGS) {
        applyPos(view, keys, lookup, msg.pos);
      }
    });
    // Trang tải lại / chuyển trang: port đóng. Panel sẽ start lại khi tab tải xong.
    port.onDisconnect.addListener(() => {
      if (current === session) stop({ kind: "connecting" });
    });
    send({ type: "init", ids });
  }

  return { start, stop };
}

/** Bật / tắt đồng bộ. Bật mà chưa có quyền thì xin quyền — phải gọi ngay trong handler click. */
export async function toggleScrollSync(status: SyncStatus): Promise<void> {
  if (status.kind === "no-permission") {
    await chrome.permissions.request({ origins: HOST_ORIGINS }).catch(() => false);
    await chrome.storage.local.set({ scrollSync: true });
    return;
  }
  await chrome.storage.local.set({ scrollSync: status.kind === "off" });
}
