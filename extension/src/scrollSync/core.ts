/**
 * Đồng bộ cuộn giữa trang gốc (tab) và bản dịch (side panel), chỉ dựa trên tiêu đề.
 * Dùng chung cho content script (scrollSync/page.ts) và side panel (scrollSync/panel.ts) — không dùng API chrome.*.
 *
 * Mỗi bên có danh sách mốc theo cùng thứ tự: đầu trang, các tiêu đề có ở cả hai bên (theo id), cuối trang.
 * Vị trí cuộn được mô tả là "đang ở đoạn giữa mốc `from` và `to`, đi được tỉ lệ `t`".
 * Bên kia cuộn tới cùng tỉ lệ giữa hai mốc tương ứng của mình — nên tiêu đề hai bên luôn thẳng hàng,
 * còn giữa hai tiêu đề thì nội tuyến theo tỉ lệ (chữ tiếng Việt dài ngắn khác bản gốc).
 */

/** Tên port giữa side panel và content script. */
export const PORT_NAME = "scroll-sync";

/** Tin nhắn qua port. */
export type SyncMessage =
  /** panel → trang: id tiêu đề của bản dịch, theo thứ tự. */
  | { type: "init"; ids: string[] }
  /** trang → panel: những id tìm thấy trên trang gốc, đúng thứ tự (đây là danh sách mốc chung). */
  | { type: "ready"; ids: string[] }
  /** hai chiều: vị trí cuộn của bên đang được người dùng cuộn. */
  | { type: "scroll"; pos: ScrollPos };

export type ScrollPos = { from: string; to: string; t: number };

/** Mốc ảo ở đầu và cuối trang (không trùng được với id thật vì id không chứa khoảng trắng). */
const START = " start";
const END = " end";

/** Đường tham chiếu: tiêu đề thẳng hàng ở 1/4 chiều cao khung nhìn (tránh header cố định ở mép trên). */
const REF_RATIO = 0.25;

/** Một vùng cuộn: cả trang (window) hoặc một phần tử có overflow. */
export type View = {
  scrollTop(): number;
  maxScroll(): number;
  /** Mép trên và chiều cao của khung nhìn, theo toạ độ viewport. */
  frame(): { top: number; height: number };
  scrollTo(top: number): void;
  /** Phần tử nhận sự kiện "scroll" (document cho window). */
  eventTarget: EventTarget;
  /** Phần tử chứa nội dung — dùng để biết thao tác của người dùng (wheel, kéo…) có nằm trong vùng này không. */
  root: Element;
};

export function windowView(): View {
  const doc = () => document.scrollingElement ?? document.documentElement;
  return {
    scrollTop: () => doc().scrollTop,
    maxScroll: () => doc().scrollHeight - doc().clientHeight,
    frame: () => ({ top: 0, height: window.innerHeight }),
    scrollTo: (top) => window.scrollTo({ top, behavior: "instant" }),
    eventTarget: document,
    root: document.documentElement,
  };
}

export function elementView(el: HTMLElement): View {
  return {
    scrollTop: () => el.scrollTop,
    maxScroll: () => el.scrollHeight - el.clientHeight,
    frame: () => {
      const r = el.getBoundingClientRect();
      return { top: r.top + el.clientTop, height: el.clientHeight };
    },
    scrollTo: (top) => el.scrollTo({ top, behavior: "instant" }),
    eventTarget: el,
    root: el,
  };
}

/** Vùng cuộn chứa `el`: phần tử cha gần nhất có overflow cuộn được, không có thì cả trang. */
export function findView(el: Element): View {
  for (let node = el.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return elementView(node);
    }
  }
  return windowView();
}

type Point = { key: string; index: number; s: number };

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

/**
 * Các mốc kèm scrollTop cần có để mốc nằm đúng đường tham chiếu, đo lại mỗi lần
 * (bố cục thay đổi khi ảnh tải xong, mở <details>…). Tiêu đề đang ẩn (kích thước 0) bị bỏ qua,
 * và mốc nào làm dãy không tăng dần cũng bị bỏ để luôn nội suy được.
 */
function measure(view: View, keys: string[], lookup: (id: string) => Element | null | undefined): Point[] {
  const max = Math.max(0, view.maxScroll());
  const { top, height } = view.frame();
  const scrollTop = view.scrollTop();
  const points: Point[] = [{ key: START, index: -1, s: 0 }];
  keys.forEach((key, index) => {
    const rect = lookup(key)?.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const s = clamp(rect.top - top + scrollTop - height * REF_RATIO, 0, max);
    if (s >= points[points.length - 1]!.s) points.push({ key, index, s });
  });
  points.push({ key: END, index: keys.length, s: max });
  return points;
}

/** Vị trí cuộn hiện tại của `view`, tính theo mốc. */
export function locate(view: View, keys: string[], lookup: (id: string) => Element | null | undefined): ScrollPos {
  const points = measure(view, keys, lookup);
  const st = view.scrollTop();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (st <= b.s || i === points.length - 2) {
      const span = b.s - a.s;
      return { from: a.key, to: b.key, t: span > 0 ? clamp((st - a.s) / span, 0, 1) : 0 };
    }
  }
  return { from: START, to: END, t: 0 };
}

/**
 * Cuộn `view` tới vị trí `pos` (do bên kia gửi).
 * Vị trí được đổi thành "chỉ số mốc thực" x (vd. 2.4 = đi 40% từ mốc 2 sang mốc 3) rồi nội suy giữa
 * các mốc đang hiện ở bên này. Nhờ vậy mốc nào đang ẩn ở một bên (tab, <details> đóng…) thì vẫn cuộn
 * đơn điệu, không bị nhảy lùi.
 */
export function applyPos(view: View, keys: string[], lookup: (id: string) => Element | null | undefined, pos: ScrollPos) {
  const indexOf = (key: string) => (key === START ? -1 : key === END ? keys.length : keys.indexOf(key));
  const fromIndex = indexOf(pos.from);
  const toIndex = indexOf(pos.to);
  // keys.indexOf trả -1 khi không có — trùng với START, nên kiểm tra riêng (danh sách mốc cũ).
  if ((fromIndex === -1 && pos.from !== START) || (toIndex === -1 && pos.to !== START)) return;
  const x = fromIndex + pos.t * (toIndex - fromIndex);
  const points = measure(view, keys, lookup);
  const a = points.filter((p) => p.index <= x).at(-1)!;
  const b = points.find((p) => p.index >= x)!;
  const target = b.index > a.index ? a.s + ((x - a.index) / (b.index - a.index)) * (b.s - a.s) : a.s;
  if (Math.abs(target - view.scrollTop()) >= 1) view.scrollTo(target);
}

/**
 * Theo dõi việc người dùng tự cuộn `view` (không phải do code cuộn theo bên kia), gọi `onUserScroll`
 * tối đa một lần mỗi khung hình. Chỉ bên vừa có thao tác (wheel, chạm, phím, kéo thanh cuộn) mới
 * được gửi vị trí — tránh vòng lặp A cuộn B, B lại kéo A.
 */
export function watchUserScroll(view: View, onUserScroll: () => void): () => void {
  const LEAD_MS = 600;
  let lastInput = 0;
  /** Đang giữ chuột (vd. kéo thanh cuộn) — có thể lâu hơn LEAD_MS. */
  let pointerHeld = false;
  let frame = 0;
  const onInput = (e: Event) => {
    if (e.type === "pointerup" || e.type === "pointercancel") {
      pointerHeld = false;
      lastInput = Date.now();
      return;
    }
    const target = e.target as Node | null;
    // Phím (PageDown, Space, mũi tên…) không có vị trí — tính cho vùng cuộn có focus.
    if (e.type !== "keydown" && !(target && (view.root.contains(target) || target === document))) return;
    if (e.type === "pointerdown") pointerHeld = true;
    lastInput = Date.now();
  };
  const onScroll = (e: Event) => {
    if (e.target !== view.eventTarget) return;
    if ((!pointerHeld && Date.now() - lastInput > LEAD_MS) || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      onUserScroll();
    });
  };
  const inputs = ["wheel", "touchstart", "touchmove", "pointerdown", "pointerup", "pointercancel", "keydown"] as const;
  for (const type of inputs) window.addEventListener(type, onInput, { capture: true, passive: true });
  // Sự kiện scroll của phần tử không nổi bọt — nghe ở pha capture trên document.
  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  return () => {
    for (const type of inputs) window.removeEventListener(type, onInput, { capture: true });
    document.removeEventListener("scroll", onScroll, { capture: true });
    cancelAnimationFrame(frame);
  };
}
