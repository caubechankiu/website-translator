# Website Translator — Chrome extension

Dịch nội dung trang đang xem sang tiếng Việt qua API trong `../api`, hiển thị ở side panel.

## Build & cài

```bash
npm install
npm run build        # hoặc: npm run watch
```

Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `dist/`.

Lần đầu: mở **Cài đặt** (nút ⚙ trong side panel), nhập API URL (vd. `http://localhost:3000`) và `SECRET`, bấm **Kiểm tra kết nối**. Chrome sẽ hỏi cấp quyền truy cập đúng origin của API URL.

## Cách hoạt động

1. Bấm icon extension → mở side panel; panel gọi `GET /api/websites?url=` và hiện bản dịch đã lưu (render Markdown). Tự cập nhật khi đổi tab / chuyển trang.
2. Trang chưa dịch → nút **Dịch trang này**; đã dịch → nút **Dịch lại**.
3. Cả hai nút lấy nội dung Markdown theo thứ tự rồi gọi `POST /api/translate` (**Dịch lại** gửi `force: true`):
   1. Tự bấm nút **Copy page** / **Copy Markdown** của trang (`src/pageCopy.ts`).
   2. Clipboard, nếu người dùng vừa tự copy Markdown.
   3. Tự chuyển HTML của trang sang Markdown bằng Turndown (`src/extract/`). Mỗi framework có một adapter
      (Starlight/Astro, Docusaurus, VitePress, MkDocs Material, TypeDoc) biết vùng nội dung, phần giao diện cần bỏ và cách
      chuyển code block, callout, tabs. Trang khác dùng adapter `generic`. Muốn hỗ trợ framework mới thì thêm
      adapter vào `ADAPTERS` trong `src/extract/adapters.ts` (đặt trước `generic`).
