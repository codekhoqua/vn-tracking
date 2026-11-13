# VN-Tracking

![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/Archive-SQLite%20%7C%20Turso-003B57?logo=sqlite&logoColor=white)
![Frontend](https://img.shields.io/badge/Frontend-Jinja2%20%2B%20Vanilla%20JS-F7DF1E?logo=javascript&logoColor=black)

Ứng dụng web nội bộ quản lý tiến độ sản xuất cho team Việt Nam (LinkStory): theo dõi task manga/comic theo tuần, checklist giao nhận, logtime, kho tài nguyên và báo cáo vận hành.

## Tính năng

| Nhóm | Nội dung |
| --- | --- |
| Dashboard | Kanban theo 3 tuần (trước / này / sau), metric theo loại task, biểu đồ tiến độ |
| Task | Chi tiết task, checklist 9 bước, liên kết Mikan / Notion / Asana / Dropbox |
| Cộng tác | Comment bàn giao, quick tag, thông báo realtime, chat team |
| Thời gian | Time tracker theo session, lịch sử logtime, ghi trực tiếp lên Google Sheet |
| LSA Drive | Quản lý file/folder trên Supabase Storage (fallback filesystem) |
| Lịch sử | Tra cứu task cũ theo tác phẩm, kanban lịch sử, mở chi tiết chỉ đọc |
| Nghỉ phép | Form nhiều bước, upload ảnh xác nhận, tạo Calendar event, gửi email admin |
| Tiện ích | Weather + album ảnh, Lofi Radio, thú cưng 3D |
| Quản trị | Phân quyền member/admin, đổi mật khẩu, cấu hình email nghỉ phép |
| Task Assignee | Leader/admin phân công người làm trực tiếp lên Google Sheet JP; hiển thị độ khó Dễ / Trung bình / Khó lấy từ logtime (cache DB) |
| Notion | Xuất CSV cho DB project và DB task (kèm trạng thái, lịch làm việc, người làm) |

## Công nghệ

- **Backend:** Python 3.11, Flask 3, Flask-SocketIO
- **Frontend:** Jinja2, Vanilla CSS, Vanilla JavaScript (không bundler)
- **Dữ liệu:** Google Sheets (nguồn task), SQLite/Turso (kho lưu trữ dài hạn), Supabase Storage (file/ảnh)
- **Giao diện:** responsive, light/dark, song ngữ Việt / Nhật

## Cấu trúc

```text
.
├── app.py                     # Backend: routes, socket events, tích hợp
├── task_archive.py            # Schema + đọc/ghi kho lưu trữ task
├── archive_store.py           # Backend lưu trữ: Turso hoặc SQLite
├── requirements.txt
├── Dockerfile
├── env_vars.example.yaml      # Mẫu biến môi trường (copy thành env_vars.yaml)
├── credentials.json           # Google service account (local, không commit)
├── templates/                 # base / login / dashboard / drive / calendar / history / psd_tool
├── static/                    # CSS, JS, audio, ảnh, model, weather album
├── data/                      # Dữ liệu runtime (SQLite, đơn nghỉ phép, file đính kèm)
├── scripts/                   # Archive sync, Turso setup, đóng gói deploy, tiện ích
├── integrations/              # Google Apps Script (Drive, Calendar, email)
└── docs/                      # Tài liệu thiết kế, deploy và sản phẩm
```

## Task Assignee + độ khó task

Tool **Task Assignee** (sidebar TOOLS, chỉ leader/admin) đọc task từ tab
`LS受注_all` của sheet `写植スケ管理表` (Google Sheet JP), hiển thị độ khó và cho chọn
người làm từ dropdown. Danh sách task đọc bằng CSV export (không tốn quota
Sheets API); độ khó đọc từ bảng DB `task_difficulty` (Turso/SQLite) nên không
gọi lại sheet 日報 mỗi lần mở UI.

- Đồng bộ độ khó: nút **Đồng bộ độ khó** hoặc tự chạy nền khi dữ liệu cũ hơn
  `DIFFICULTY_SYNC_TTL` (mặc định 30 phút).
- Nguồn: cột `難易度` trong logtime (`低` = Dễ, `中` = Trung bình, `高` = Khó);
  task chưa có nhãn thì ước lượng từ số trang + phút/trang theo loại việc.
- Bảng độ khó gồm 3 phạm vi: `exact` (công việc + tác phẩm + tập + chương),
  `title` (công việc + tác phẩm), `job` (loại công việc).
- Bảng `worker_skill` lưu kinh nghiệm từng người theo loại việc/tác phẩm.
- Tool gợi ý top người làm theo team, kinh nghiệm, độ khó và tải tuần;
  panel **Cân bằng tải** hiển thị task/giờ ước tính của tuần này và tuần sau.
  `ASSIGNEE_WEEK_CAPACITY_HOURS` (mặc định 40) là mốc giờ/người/tuần.

### Ghi vào cột 作業者

Cột này nằm ở tab `LS受注_all` của sheet `写植スケ管理表`. Service account đã có quyền ghi trực tiếp (tab không bị Protect). Nếu sau này bị Protect, có 2 cách:

1. **Thêm service account vào vùng Protect** (khuyến nghị, 1 lần):
   Google Sheet → Data → Protect sheets and ranges → chọn vùng đang bảo vệ →
   Change permissions → thêm `logtime-sa@logtime-app-3366.iam.gserviceaccount.com`
   làm Editor.
2. **Dùng Apps Script proxy**: deploy `integrations/assign_task_webapp.gs`
   (Execute as: Me, Who has access: Anyone), rồi khai báo trong `env_vars.yaml`:
   ```yaml
   ASSIGNEE_WRITE_URL: "https://script.google.com/macros/s/.../exec"
   ASSIGNEE_WRITE_TOKEN: "chuoi-bi-mat-giong-WRITE_TOKEN-trong-script"
   ```
   Script chạy dưới quyền owner nên ghi được ô đang Protect.

## Cài đặt

Yêu cầu: **Python 3.11+**.

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp env_vars.example.yaml env_vars.yaml
# Điền cấu hình thật vào env_vars.yaml
# Đặt credentials.json (Google service account) ở thư mục gốc nếu dùng Sheets/Drive

python app.py
```

Mở `http://127.0.0.1:5000`.

## Cấu hình

Toàn bộ cấu hình nằm trong `env_vars.yaml` (không commit) hoặc biến môi trường của hệ thống. Xem mẫu đầy đủ tại [`env_vars.example.yaml`](env_vars.example.yaml).

| Nhóm | Biến chính |
| --- | --- |
| Ứng dụng | `SECRET_KEY`, `TZ` |
| Supabase Storage | `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_BUCKET` |
| Kho lưu trữ | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `ARCHIVE_SQLITE_PATH` |
| Đồng bộ archive | `ARCHIVE_SYNC_INTERVAL`, `ARCHIVE_CRON_TOKEN` |
| Calendar / nghỉ phép | `GOOGLE_CALENDAR_EMBED_URL`, `LEAVE_GDRIVE_SCRIPT_URL`, `LEAVE_RESPONSES_SPREADSHEET_ID` |
| Task Assignee | `DIFFICULTY_SYNC_TTL`, `ASSIGNEE_WRITE_URL`, `ASSIGNEE_WRITE_TOKEN` |
| Tuỳ chọn | `PORT`, `CF_TUNNEL_TOKEN` |

- Thiếu Supabase: app dùng fallback filesystem `drive_data/`.
- Thiếu Turso: app dùng SQLite local `data/vn_tracking_archive.db`.

## Dữ liệu & lưu trữ

- **Google Sheets** giữ task của 3 tuần gần nhất.
- **SQLite/Turso** lưu lịch sử task, comment, checklist event và link.
- **Supabase Storage** lưu ảnh album, file drive, pet, radio.

Các file `env_vars.yaml`, `credentials.json`, dữ liệu runtime trong `data/` và ảnh người dùng **không được commit**.

## Chạy production

```bash
gunicorn -c gunicorn.conf.py wsgi:app
```

Hoặc dùng Docker:

```bash
docker build -t vn-tracking .
docker run --env-file .env -p 8080:8080 vn-tracking
```

Khuyến nghị đặt sau reverse proxy (Nginx/Caddy/Cloudflare Tunnel), bật HTTPS và giới hạn quyền truy cập.

## Xuất CSV cho Notion

Trong trang chi tiết task có hai nút xuất:

- **Export Project** — thông tin project cho `DB_作品管理`.
- **Export Task** — thông tin task cho `DB_工程管理`.

File CSV dùng UTF-8 (BOM), cột `作業日程` là khoảng thứ 2 → thứ 6 của tuần làm việc, `納品日` lấy theo Google Sheet, trạng thái xuất là `In Progress`.

## Ghi chú

- Dự án nội bộ của LinkStory Asia.
- Không commit secret, service account hoặc dữ liệu người dùng.
- Trước khi deploy: kiểm tra `env_vars.yaml`, quyền thư mục `data/` và backup DB.
