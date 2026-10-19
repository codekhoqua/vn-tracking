# Deploy lên Cloudcode (Pterodactyl panel)

Cloudcode (`cloudcode.io.vn`) là panel Pterodactyl (Files / Startup / Console), **không phải Google Cloud**.

## Quy ước file zip

Luôn đóng gói **bản FULL**:

- Nội dung nằm **phẳng ở gốc zip** (không bọc thêm thư mục `vn-tracking/`).
- Bao gồm:
  - toàn bộ source (`app.py`, `templates/`, `static/`, `requirements.txt`, ...)
  - `env_vars.yaml`
  - `credentials.json`
  - `data/leave_requests.json`, `data/leave_admin_config.json`
- Loại trừ:
  - `data/vn_tracking_archive.db` (+ `.db-wal`, `.db-shm`) — DB thật đang chạy trên
    server, đóng vào zip sẽ **đè mất dữ liệu** (task/comment/checklist/link/avatar).
    Bảng `user_avatars` tự được tạo khi app khởi động.
  - `.git/`, `__pycache__/`, `drive_data/`, `.venv/`
  - `*.pyc`, `*.log`, `*.zip`, `*.msi`
  - `data/leave_attachments/`
  - `static/weather_album/_thumbs/`

Tên gợi ý:

```
vn-tracking-cloudcode-v<version>-full.zip
```

## Bắt buộc: đường dẫn POSIX trong zip

Entry trong zip phải dùng dấu `/`, **không dùng `\`** (Windows). Nếu dùng `\`,
panel Linux sẽ không tạo thư mục `templates/` và `static/`, dẫn tới:

- `TemplateNotFound: login.html / dashboard.html` → HTTP 500
- `/static/css/style.css` → 404
- `/api/app_version` trả `version: "dev"`

Dùng script có sẵn để đóng gói đúng chuẩn:

```bash
python scripts/build_cloudcode_zip.py
# hoặc chỉ định đường dẫn:
python scripts/build_cloudcode_zip.py -o "D:\path\vn-tracking-cloudcode-v<version>-full.zip"
```

Script luôn tạo **một bản full duy nhất** (kèm `env_vars.yaml`, `credentials.json`, `data/`),
tự tạo entry thư mục (`templates/`, `static/`, ...) và đường dẫn POSIX.

> Zip chứa secret (Supabase key, service account Google). Chỉ lưu nội bộ, không upload nơi công khai.

## Avatar & DB archive

- Ảnh avatar lưu trong bảng `user_avatars` của DB archive (không up Google Drive).
- Sheet "Pass" cột `Avatar` chỉ lưu URL ngắn `/api/avatar/<username>`.
- Nếu server **không** cấu hình Turso: DB là file `data/vn_tracking_archive.db` trên
  server. Redeploy không đè file này nên avatar giữ nguyên.
- Nếu muốn dữ liệu bền vững nhiều instance: đặt `TURSO_DATABASE_URL` +
  `TURSO_AUTH_TOKEN` trong `env_vars.yaml` trên server.

## Cập nhật server đang chạy

1. Panel → **Stop**.
2. **Files** → upload zip vào thư mục gốc `/` → **Unarchive**.
   Nếu panel tạo folder con, move toàn bộ file ra `/` rồi xoá folder rỗng.
3. **Console** (chỉ khi thiếu thư viện mới):
   ```bash
   pip install Pillow
   ```
4. **Startup**: `python app.py` (app tự đọc `SERVER_PORT` do panel cấp).
5. **Start** và kiểm tra Console log + URL panel cấp.

## Cài mới hoàn toàn

Dùng cùng bản full; sau khi unarchive, chạy `pip install -r requirements.txt` một lần rồi `python app.py`.
