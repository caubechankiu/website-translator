# Website Translator — Web (PWA cho Android)

Web tĩnh chỉ để **xem** bản dịch đã lưu (`GET /api/websites`), không dịch. Trang chưa dịch thì báo
"Trang này chưa được dịch". Phần render Markdown và CSS dùng chung với extension ở `../shared/`.

## Build & chạy

```bash
npm install
npm run build   # ra dist/
npm run watch   # dev: http://localhost:5173
```

Cấu hình trong `web/.env` (hoặc biến môi trường, được ưu tiên hơn file):

```bash
API_URL=http://localhost:3000   # bắt buộc khi build; watch mặc định http://localhost:3000
```

## Deploy (Vercel, project riêng)

- Root Directory: `web`, bật "Include files outside the root directory" (mặc định đã bật) vì build cần `../shared/`.
- Biến môi trường: `API_URL`.
- Deploy bằng CLI thì chạy `vercel` ở **gốc repo** (không phải trong `web/`) để `shared/` được upload.

## Cài trên Android

1. Mở URL của web bằng Chrome → nhập `SECRET` (giống extension).
2. ⋮ → **Thêm vào màn hình chính** → **Cài đặt**.
3. Đang xem trang bất kỳ → ⋮ → **Chia sẻ** → **Dịch trang**.

Icon PNG được xuất từ `public/icons/icon.svg` và `public/icons/maskable.svg` (bản tràn viền cho launcher Android).
