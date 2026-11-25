/**
 * Content script đồng bộ cuộn, chạy trong trang gốc (ISOLATED world).
 * Được inject bằng chrome.scripting.executeScript({ files: ["scrollSync.js"] }) mỗi khi panel cần đồng bộ;
 * inject lại nhiều lần cũng chỉ đăng ký một lần. Side panel mở port PORT_NAME tới tab này.
 */
import { applyPos, findView, locate, PORT_NAME, watchUserScroll, type SyncMessage, type View } from "./core";

declare global {
  // eslint-disable-next-line no-var
  var __scrollSyncInstalled: boolean | undefined;
}

const HEADING = "h1, h2, h3, h4, h5, h6";

/**
 * Tiêu đề trên trang gốc ứng với id. GitHub đặt id dạng "user-content-<id>" trên thẻ <a> cạnh tiêu đề
 * (link vẫn là "#<id>"), nên thử cả hai và lấy thẻ tiêu đề gần nhất.
 */
function findHeading(id: string): Element | null {
  const el = document.getElementById(id) ?? document.getElementById(`user-content-${id}`);
  if (!el) return null;
  return el.matches(HEADING) ? el : (el.closest(HEADING) ?? el.parentElement?.querySelector(HEADING) ?? el);
}

function connect(port: chrome.runtime.Port) {
  let keys: string[] = [];
  const elements = new Map<string, Element>();
  let view: View | undefined;
  let stopWatching: (() => void) | undefined;

  const send = (msg: SyncMessage) => {
    try {
      port.postMessage(msg);
    } catch {
      /* port đã đóng */
    }
  };

  port.onMessage.addListener((msg: SyncMessage) => {
    if (msg.type === "init") {
      // Chỉ giữ tiêu đề tìm thấy và đúng thứ tự trong trang (id trùng / sai thứ tự thì bỏ).
      keys = [];
      elements.clear();
      let prev: Element | undefined;
      for (const id of msg.ids) {
        const el = findHeading(id);
        if (!el || [...elements.values()].includes(el)) continue;
        if (prev && !(prev.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
        keys.push(id);
        elements.set(id, el);
        prev = el;
      }
      stopWatching?.();
      const first = elements.values().next().value;
      view = first ? findView(first) : undefined;
      stopWatching = view && watchUserScroll(view, () => send({ type: "scroll", pos: locate(view!, keys, (id) => elements.get(id)) }));
      send({ type: "ready", ids: keys });
      // Panel cuộn theo trang ngay từ đầu (trang có thể đang ở giữa).
      if (view) send({ type: "scroll", pos: locate(view, keys, (id) => elements.get(id)) });
    } else if (msg.type === "scroll" && view) {
      applyPos(view, keys, (id) => elements.get(id), msg.pos);
    }
  });
  port.onDisconnect.addListener(() => stopWatching?.());
}

if (!globalThis.__scrollSyncInstalled) {
  globalThis.__scrollSyncInstalled = true;
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === PORT_NAME) connect(port);
  });
}
