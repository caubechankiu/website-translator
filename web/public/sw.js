// Service worker tối thiểu để Chrome Android cài được app (WebAPK) và hiện trong menu Chia sẻ.
// Không cache gì: bản dịch luôn lấy mới từ API. Mất mạng thì báo lỗi thay vì trang lỗi của Chrome.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><p style="font:16px system-ui;padding:16px">Không có kết nối mạng.</p>',
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
