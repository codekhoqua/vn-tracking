# Deploy lên Cloudcode (Pterodactyl panel)

Cloudcode (`cloudcode.io.vn`) là panel Pterodactyl (Files / Startup / Console), **không phải Google Cloud**.

Có 2 cách deploy:

1. **GitHub (khuyến nghị)**: panel clone/pull code từ repo, không cần upload zip mỗi lần.
2. **ZIP full**: dùng khi cần mang theo secret, data JSON, `cloudflared` trong một lần upload.

> `env_vars.yaml` và `credentials.json` **không nằm trong Git**. Khi deploy Git, upload 2 file này một lần lên server (hoặc dùng Environment Variables của panel). Không commit secret lên GitHub.

---

## 1. Deploy từ GitHub (khuyến nghị)

### Cấu hình panel → Startup

| Trường | Giá trị |
|---|---|
| `GIT REPO ADDRESS` | `https://github.com/codekhoqua/vn-tracking` |
| `GIT BRANCH` | `master` |
| `AUTO UPDATE` | `1` |
| `APP PY FILE` | `app.py` |
| `REQUIREMENTS FILE` | `requirements.txt` |
| `DOCKER IMAGE` | `Python 3.11` |
| `USER UPLOADED FILES` | `0` |
| `GIT ACCESS TOKEN` | Chỉ điền nếu repo **private** |

`AUTO UPDATE=1` chỉ pull khi server **restart**, không pull ngay sau khi push. Quy trình cập nhật:

```text
push lên GitHub master → panel Restart → panel pull code mới → app chạy
```

### Chuyển server đang chạy từ ZIP sang Git

Server đang cài bằng zip thường **không có `.git`**, nên panel không tự pull được. Dùng script có sẵn để chuyển một lần, an toàn.

> **Nên Stop app trước khi chạy** để SQLite/DB không bị tách file khi script di chuyển `data/`.
>
> Nếu panel không cho gõ Console lúc server đang Stop, làm tạm:
>
> 1. Panel → Startup: đổi `APP PY FILE` thành `scripts/setup_cloudcode_git.py`, `AUTO UPDATE` = `0`.
> 2. Start; xem Console đến khi script báo **HOÀN TẤT** rồi Stop.
> 3. Đổi lại `APP PY FILE` = `app.py`, `AUTO UPDATE` = `1`; Start.
>
> Nếu đã upload script ra thư mục gốc thì dùng `setup_cloudcode_git.py` thay cho `scripts/setup_cloudcode_git.py`.

Chạy khi app đã dừng (hoặc qua Console nếu panel cho phép):

```bash
cd /home/container
curl -fsSL https://raw.githubusercontent.com/codekhoqua/vn-tracking/master/scripts/setup_cloudcode_git.py -o /tmp/setup_cloudcode_git.py
python /tmp/setup_cloudcode_git.py
```

Nếu repo private hoặc server không tải được raw GitHub: upload `scripts/setup_cloudcode_git.py` lên `/home/container` bằng Files rồi chạy:

```bash
cd /home/container
python setup_cloudcode_git.py
```

Script sẽ:

- Backup toàn bộ app cũ vào `backup_local/pre_git_<timestamp>/old_tree`.
- Khởi tạo Git, fetch đúng branch `master`, checkout code mới.
- Giữ lại:
  - `env_vars.yaml`, `env.yaml`, `.env*`
  - `credentials.json`
  - `cloudflared` + `cloudflared.log`
  - `data/` (DB archive, notifications, leave requests, users cache, ...)
  - `static/chat_uploads/`
  - `static/weather_album/`
  - `logs/`, `drive_data/`, `backup_local/`
- Đánh dấu `skip-worktree` cho các file runtime đã bị server sửa (ví dụ `data/leave_admin_config.json`, `static/weather_album/album.json`) để `git pull` không ghi đè hoặc báo lỗi.
- Nếu lỗi giữa chừng, tự rollback về code cũ.

Sau khi script báo **HOÀN TẤT**:

1. Vào panel → **Startup**, điền các trường như bảng phía trên.
2. **Restart** server.
3. Kiểm tra Console log, đăng nhập, chat, avatar, LSA Music và Cloudflare Tunnel.
4. Khi mọi thứ ổn, có thể xoá `backup_local/pre_git_*` để giải phóng dung lượng.

Chạy lại script khi đã có `.git` sẽ chỉ kiểm tra remote và `git pull --ff-only`, không backup/ghi đè lần nữa.

### Cài mới bằng Git

1. Tạo server CloudCode với các trường Startup như bảng phía trên.
2. Upload một lần các file không có trong Git:
   - `env_vars.yaml` (hoặc nhập Environment Variables trên panel)
   - `credentials.json` (hoặc đặt `GOOGLE_CREDENTIALS_B64`)
   - `cloudflared` nếu server không tải được từ GitHub Releases
   - `data/` cũ (nếu muốn giữ DB, notifications, đơn nghỉ phép)
   - `static/chat_uploads/`, `static/weather_album/` cũ (nếu muốn giữ ảnh)
3. **Start** server. App tự tạo DB/schema và các thư mục runtime còn thiếu.

### Secret, Cloudflare và dữ liệu runtime

- `env_vars.yaml`, `credentials.json` và `cloudflared` đều bị `.gitignore`, nên `git pull` **không xoá** chúng.
- `cloudflared` không có trong Git. Trên Linux, `app.py` tự tải bản `cloudflared-linux-amd64` hoặc `arm64` nếu thiếu. Script chuyển đổi giữ lại binary hiện có; nếu server chặn GitHub Releases, upload `cloudflared` thủ công vào `/home/container`.
- Google credentials có thể dùng file `credentials.json` hoặc biến môi trường `GOOGLE_CREDENTIALS_B64` (base64 của file JSON).
- Không chạy `git clean -fdx` trên server: lệnh này sẽ xoá secret, DB, ảnh chat và album.
- Nếu cần cập nhật một file runtime đang bị `skip-worktree` từ repo, chạy có chủ đích:
  ```bash
  git update-index --no-skip-worktree -- data/leave_admin_config.json
  git checkout -- data/leave_admin_config.json
  ```

---

## 2. Deploy bằng ZIP full

### Quy ước file zip

Luôn đóng gói **bản FULL**:

- Nội dung nằm **phẳng ở gốc zip** (không bọc thêm thư mục `vn-tracking/`).
- Bao gồm:
  - toàn bộ source (`app.py`, `templates/`, `static/`, `requirements.txt`, ...)
  - `env_vars.yaml`
  - `credentials.json`
  - `cloudflared` (binary Cloudflare Tunnel, nếu có trong project)
  - `data/leave_requests.json`, `data/leave_admin_config.json`, các JSON runtime khác
- Loại trừ:
  - `data/vn_tracking_archive.db` (+ `.db-wal`, `.db-shm`) — DB thật đang chạy trên
    server, đóng vào zip sẽ **đè mất dữ liệu** (task/comment/checklist/link/avatar).
    Bảng `user_avatars` tự được tạo khi app khởi động.
  - `.git/`, `__pycache__/`, `drive_data/`, `.venv/`
  - `backup_local/`, `logs/`, `.opencode/` (rác dev)
  - `*.pyc`, `*.log`, `*.zip`, `*.msi`
  - `data/leave_attachments/`
  - `static/weather_album/_thumbs/`

Tên gợi ý:

```text
vn-tracking-cloudcode-v<version>-full.zip
```

### Bắt buộc: đường dẫn POSIX trong zip

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
tự tạo entry thư mục (`templates/`, `static/`, ...) và đường dẫn POSIX. Script cũng báo
`Cloudflared: có trong zip` / `KHÔNG có` để biết binary tunnel có được đóng gói hay chưa.

> Zip chứa secret (Supabase key, service account Google, Cloudflare token). Chỉ lưu nội bộ, không upload nơi công khai.

### Cập nhật server đang chạy bằng ZIP

1. Panel → **Stop**.
2. **Files** → upload zip vào thư mục gốc `/` → **Unarchive**.
   Nếu panel tạo folder con, move toàn bộ file ra `/` rồi xoá folder rỗng.
3. **Console** (chỉ khi thiếu thư viện mới):
   ```bash
   pip install Pillow
   ```
4. **Startup**: `python app.py` (app tự đọc `SERVER_PORT` do panel cấp).
5. **Start** và kiểm tra Console log + URL panel cấp.

### Cài mới hoàn toàn

Dùng cùng bản full; sau khi unarchive, chạy `pip install -r requirements.txt` một lần rồi `python app.py`.

Nếu chuyển sang Git sau khi cài ZIP, chạy script ở mục **1** để giữ nguyên secret/data.

---

## Avatar & DB archive

- Ảnh avatar lưu trong bảng `user_avatars` của DB archive (không up Google Drive).
- Sheet "Pass" cột `Avatar` chỉ lưu URL ngắn `/api/avatar/<username>`.
- Nếu server **không** cấu hình Turso: DB là file `data/vn_tracking_archive.db` trên
  server. Redeploy không đè file này nên avatar giữ nguyên.
- Nếu muốn dữ liệu bền vững nhiều instance: đặt `TURSO_DATABASE_URL` +
  `TURSO_AUTH_TOKEN` trong `env_vars.yaml` trên server.
