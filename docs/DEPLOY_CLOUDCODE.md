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
  - `.git/`, `__pycache__/`, `drive_data/`, `.venv/`
  - `*.pyc`, `*.log`, `*.zip`, `*.msi`
  - `data/leave_attachments/`
  - `static/weather_album/_thumbs/`

Tên gợi ý:

```
vn-tracking-cloudcode-v<version>-full.zip
```

> Zip chứa secret (Supabase key, service account Google). Chỉ lưu nội bộ, không upload nơi công khai.

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
