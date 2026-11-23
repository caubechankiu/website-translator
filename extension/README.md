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
3. Cả hai nút đọc nội dung từ clipboard (người dùng tự copy trước) rồi gọi `POST /api/translate`. **Dịch lại** gửi `force: true`.
