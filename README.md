# VN-Tracking

Ứng dụng web nội bộ quản lý tiến độ sản xuất cho team bản địa hoá manga/comic (LinkStory).
Theo dõi task theo tuần, checklist giao nhận, logtime, drive tài nguyên, nghỉ phép và các tiện ích
đồng hành (thú cưng ảo, Lofi Radio, chat team).

- Backend: Python / Flask 3 + Flask-SocketIO
- Frontend: Jinja2, Vanilla CSS, Vanilla JS (không bundler)
- Dữ liệu: Google Sheets (đọc/ghi) + **DB SQL cho task/comment/checklist/link** (Turso, fallback SQLite) + Supabase Storage (ảnh, drive, pet, radio)
- Ngôn ngữ: Tiếng Việt / 日本語
- Giao diện: Light / Dark, responsive

## Tính năng chính

| Nhóm | Nội dung |
| --- | --- |
| Dashboard | Kanban theo 3 tuần (trước / này / sau), metric theo loại task, biểu đồ, AI insight |
| Task | Chi tiết task, checklist 9 bước, link Mikan / Notion / Asana / Dropbox |
| Cộng tác | Comment bàn giao, quick tag, thông báo realtime, Team Chat, bot dịch `@bot` |
| Thời gian | Time tracker theo session + lịch sử, logtime ghi trực tiếp lên Google Sheet |
| LSA Drive | Quản lý file/folder trên Supabase Storage (fallback filesystem), upload trực tiếp |
| Lịch sử task | Tra task cũ theo tác phẩm (SQL/Turso), Kanban như dashboard, mở chi tiết task chỉ đọc |
| Nghỉ phép | Form nhiều bước, nén & upload ảnh xác nhận lên Google Drive, tạo Calendar event, email admin |
| Tiện ích | Weather + album filmstrip, Lofi Radio (DJ chung, queue, automix), thú cưng 3D |
| Quản trị | Phân quyền member/admin, đổi mật khẩu, cấu hình email nghỉ phép |

## Cấu trúc project

```
.
├── app.py                     # Toàn bộ backend: routes, socket events, tích hợp
├── task_archive.py            # Kho lưu trữ dài hạn: schema + đọc/ghi task
├── archive_store.py           # Backend lưu trữ: Turso (HTTP) hoặc SQLite
├── requirements.txt
├── Dockerfile                 # Gunicorn + eventlet cho Cloud Run
├── vercel.json                # Cấu hình deploy serverless
├── start_local.bat            # Chạy local trên Windows
├── sync_master.bat            # Đồng bộ code/config từ GitHub + Supabase
├── env_vars.example.yaml      # Mẫu biến môi trường (copy thành env_vars.yaml)
├── credentials.json           # Service account Google (local, không commit)
│
├── docs/
│   ├── DESIGN.md              # Design system & quy chuẩn giao diện
│   ├── MOTION.md              # GSAP + IntersectionObserver (API, cách dùng, debug)
│   └── PRODUCT.md             # Bối cảnh sản phẩm, người dùng, phạm vi
│
├── .opencode/skills/          # AI skills cho GSAP (vendor từ greensock/gsap-skills)
│
├── scripts/
│   ├── archive_sync.py        # Backfill/đồng bộ kho lưu trữ dài hạn (CLI)
│   ├── turso_setup.py         # Tạo DB Turso + ghi cấu hình + backfill (không cần CLI)
│   ├── build_docx.py          # Xuất tài liệu PSD từ Notion ra .docx
│   └── convert_fbx_to_glb.py  # Convert model thú cưng FBX → GLB
│
├── integrations/
│   └── google_apps_script.js  # Web App: upload Drive, Calendar, email
│
├── templates/                 # base / login / dashboard / drive / calendar / psd_tool / history
├── static/                    # css, js, audio, images, models, lottie, weather_album
└── data/                      # Dữ liệu runtime (đơn nghỉ phép, file đính kèm, archive SQLite)
```

Thư mục `static/weather_album/` và `data/` chứa dữ liệu người dùng; `data/leave_requests.json`,
`data/leave_attachments/` và `static/weather_album/_thumbs/` không được commit.

## Chạy local

Yêu cầu: **Python 3.11** (khuyến nghị, khớp với Docker). Python 3.12+ vẫn chạy local được vì
Socket.IO tự dùng `threading`, nhưng `eventlet` trong `requirements.txt` chỉ dùng cho Docker.

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt

copy env_vars.example.yaml env_vars.yaml   # rồi điền giá trị thật
# đặt credentials.json (service account Google) vào thư mục gốc

start_local.bat                 # hoặc: python app.py
```

Mở http://127.0.0.1:5000.

## Biến môi trường

`app.py` tự nạp `env_vars.yaml` ở thư mục gốc lúc khởi động (nếu chưa có trong OS env).
Trên Docker/Cloud Run/Vercel, truyền biến môi trường trực tiếp.

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `SUPABASE_URL` | Có* | URL project Supabase |
| `SUPABASE_SECRET_KEY` | Có* | Secret key (bucket private) |
| `SUPABASE_BUCKET` | Không | Tên bucket, mặc định `drive` |
| `TURSO_DATABASE_URL` | Không** | URL DB Turso (`libsql://...`) chứa kho lưu trữ task |
| `TURSO_AUTH_TOKEN` | Không** | Token Turso (`turso db tokens create`) |
| `ARCHIVE_SYNC_INTERVAL` | Không | Chu kỳ tự đồng bộ archive, mặc định `900` giây |
| `ARCHIVE_CRON_TOKEN` | Không | Token cho endpoint cron `/api/archive/cron?token=...` |
| `ARCHIVE_SQLITE_PATH` | Không | Đường dẫn SQLite khi không dùng Turso |
| `SECRET_KEY` | Nên đổi | Khoá session Flask |
| `GROQ_API_KEY` | Không | Bật AI insight (LLaMA 3.1) |
| `TZ` | Không | Mặc định `Asia/Ho_Chi_Minh` |
| `GOOGLE_CALENDAR_EMBED_URL` | Không | iframe Google Calendar cho route `/calendar` |
| `LEAVE_GDRIVE_SCRIPT_URL` | Không | URL Apps Script xử lý ảnh/Calendar/email nghỉ phép |
| `LEAVE_RESPONSES_SPREADSHEET_ID` | Không | Sheet lưu đơn nghỉ phép |
| `LEAVE_RESPONSES_SHEET_TAB` | Không | Tab đích, mặc định `Form Responses 1` |
| `CF_TUNNEL_TOKEN` | Không | Token Cloudflare Tunnel (chỉ chạy trên Linux) |
| `GOOGLE_CREDENTIALS_B64` | Không | Service account dạng base64 (thay cho `credentials.json`) |
| `PORT` | Không | Mặc định `5000` local, `8080` trong Docker |

\* Nếu thiếu Supabase, app chạy fallback với filesystem `drive_data/`.

\** Nếu thiếu Turso, app tự dùng SQLite local `data/vn_tracking_archive.db`.
Trên Vercel (filesystem read-only) thì dùng `/tmp` — dữ liệu sẽ mất khi
instance tái tạo, nên production bắt buộc cấu hình Turso.

## Kho lưu trữ dài hạn (archive)

### Vì sao cần

Sheet của JP chỉ giữ **~3 tuần** task (các tab `After week`, `Data Sort` bị
luân chuyển), nên task của tháng cũ bị mất khỏi web. Comment/checklist trước
đây lưu trên Supabase Storage dưới dạng **một file JSON duy nhất** bị ghi đè
liên tục — chỉ giữ trạng thái mới nhất, không có lịch sử.

### Kiến trúc sau khi đổi

| Dữ liệu | Nơi lưu | Lịch sử |
| --- | --- | --- |
| Task (作品名 / tập / chương / người làm / status) | DB SQL bảng `tasks` | Có — mỗi lần sync ghi thêm |
| Comment task | DB SQL bảng `task_comments` | Có — kèm `timestamp` thật |
| Checklist tick | `checklist_state` + `checklist_events` | Có — event ghi cả **người tick** |
| Link Mikan/Notion/Asana/Dropbox | DB SQL bảng `task_links` | Bản mới nhất |
| Ảnh album, file drive, pet, radio, online users | Supabase Storage (giữ nguyên) | — |

Các file `_system/checklists.json`, `_system/task_comments.json`,
`_system/task_links.json` trên Supabase vẫn được ghi song song như **bản
mirror/dự phòng**; khi đọc thì DB SQL là nguồn chính.

### Tạo DB Turso

Turso CLI **không có bản Windows** (chỉ macOS/Linux). Trên Windows dùng script
có sẵn — script gọi Turso Platform API qua HTTPS nên không cần cài gì thêm:

```powershell
# 1. Vào https://app.turso.tech -> Account -> API Tokens -> Create token
#    (token dạng JWT rất dài, bắt đầu bằng eyJ...)
# 2. Chạy:
set TURSO_API_TOKEN=<dán_token>
python scripts/turso_setup.py
```

Script tự làm hết: tạo database `vn-tracking-archive` → sinh auth token →
ghi `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` vào `env_vars.yaml` → tạo schema
→ backfill toàn bộ task + comment/checklist/link. Xem thêm:

```powershell
python scripts/turso_setup.py --help
python scripts/turso_setup.py --dry-run          # chỉ xem sẽ làm gì
python scripts/turso_setup.py --location aws-ap-northeast-1
```

Trên macOS/Linux (hoặc Cloud Shell) vẫn có thể dùng CLI như thường:

```bash
turso auth login
turso db create vn-tracking-archive
turso db show vn-tracking-archive --url          # -> libsql://...
turso db tokens create vn-tracking-archive       # -> token
```

Sau đó restart app. Trên Cloud Run / Vercel nhớ thêm 2 biến
`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` vào Environment Variables.

> Chưa cấu hình Turso thì app vẫn chạy bình thường với SQLite local — trang
> `/history` hoạt động ngay, chỉ không dùng chung được giữa các máy.

### Backfill & đồng bộ

```bash
python scripts/archive_sync.py                 # kéo task + comment/checklist/link
python scripts/archive_sync.py --sheets-only   # chỉ task từ Google Sheet
python scripts/archive_sync.py --state-only    # chỉ state từ Supabase
python scripts/archive_sync.py --stats         # xem thống kê
python scripts/archive_sync.py --titles 20      # liệt kê tác phẩm
```

Trong app, archive tự đồng bộ nền mỗi `ARCHIVE_SYNC_INTERVAL` giây khi có
người mở Dashboard, và có thể gọi tay bằng nút **Đồng bộ ngay** trên trang
`/history`. Với scheduler bên ngoài, dùng:

```
GET https://<domain>/api/archive/cron?token=<ARCHIVE_CRON_TOKEN>
```

### Xem lịch sử

Trong app: **Tools → Lịch sử task** (mở dạng trang con giống *LSA Drive*, có
nút *Trở về Dashboard* + Esc để đóng). Đường dẫn trực tiếp là `/history`.

Gõ tên tác phẩm để tra toàn bộ tập/chương từng làm, lọc theo ngày/người
làm/loại việc, và xem mọi comment của tác phẩm đó.

Bấm vào một thẻ Kanban sẽ mở **đúng trang chi tiết task như tab Task** của
dashboard, đầy đủ checklist 9 bước, trạng thái thật tại thời điểm lưu, link
Mikan/Notion/Asana/Dropbox, time tracker và comment lịch sử — nhưng ở chế độ
**chỉ đọc**: logtime, import Notion/link và ô gửi comment đều bị khoá.

Với tập cũ (đã qua tuần trước), checklist được hiển thị 100% vì trước đây
không lưu state; thẻ có gắn dấu ✓ và có dòng nhắc trong trang chi tiết.

Vì Turso là SQLite, muốn soi DB trực tiếp:

```bash
turso db shell vn-tracking-archive
turso db shell vn-tracking-archive "SELECT tac_pham, COUNT(*) FROM tasks GROUP BY tac_pham ORDER BY 2 DESC LIMIT 20"
```

Hoặc dùng `turso db dump` / `turso db shell .dump` để tải về mở bằng DB Browser.

> Không commit `env_vars.yaml` và `credentials.json`. Nếu các khoá từng bị lộ, hãy rotate
> (Supabase secret, Groq, service account, Cloudflare tunnel).

## Bảo mật

### Sheet tài khoản (`Pass`) — đã vá

Trước đây `load_users_from_sheet()` đọc sheet bằng **CSV export công khai**, nên bất kỳ ai
có link đều đọc được **mật khẩu dạng plaintext** của toàn bộ tài khoản. Nay hàm này đọc
bằng **service account** (`credentials.json` hoặc `GOOGLE_CREDENTIALS` /
`GOOGLE_CREDENTIALS_B64`), và chỉ fallback về CSV nếu không có credentials.

Việc cần làm để đóng lỗ hổng (chỉ cần làm 1 lần):

1. Mở sheet `Pass` → **Share** → General access → **Restricted**.
2. Giữ quyền cho service account `logtime-sa@logtime-app-3366.iam.gserviceaccount.com`
   (đã kiểm tra là account này đọc được, không cần cấp thêm).

Sheet JP master cũng đã chuyển sang đọc qua service account
(`task_archive.fetch_sheet_rows`) nên có thể khoá luôn cùng cách.

> Còn lại: cột `Password` trong sheet vẫn lưu plaintext. Muốn bỏ hẳn thì phải
> chuyển sang hash — kèm sửa Apps Script đổi mật khẩu (đang so sánh mật khẩu cũ
> trực tiếp trên sheet), nếu không sẽ hỏng luồng đổi mật khẩu.

## Deploy

### Docker / Cloud Run

```bash
docker build -t vn-tracking .
docker run -p 8080:8080 --env-file .env vn-tracking
```

`Dockerfile` dùng `gunicorn --worker-class eventlet -w 1`. Phải giữ **1 worker** vì trạng thái
radio/presence/chat lưu trong RAM và Socket.IO cần một process duy nhất.

### Vercel

`vercel.json` chạy Flask dạng serverless. WebSocket không tồn tại ở môi trường này, nên
radio/online-users tự chuyển sang polling REST và lưu trạng thái trên Supabase Storage.
Checklist, comment, task links, drive, logtime vẫn hoạt động bình thường qua HTTP.

## Giao diện & animation

- `static/js/motion.js` + `static/css/motion.css`: lớp motion dùng chung (GSAP + IntersectionObserver).
- Bật hiệu ứng bằng data-attribute (`data-reveal`, `data-reveal-group`, `data-countup`,
  `data-magnetic`, `data-pause-offscreen`) — không cần viết JS mới cho từng trang.
- Chi tiết API, cách thêm trang mới và debug: [`docs/MOTION.md`](docs/MOTION.md).
- GSAP AI skills cho coding agent nằm ở `.opencode/skills/gsap-*` (nguồn: `greensock/gsap-skills`).

## Scripts

- `scripts/build_docx.py`: cào trang Notion PSD và xuất `.docx` (cần Playwright + python-docx).
- `scripts/convert_fbx_to_glb.py`: convert model FBX sang GLB kèm texture cho thú cưng 3D.
- `sync_master.bat`: kiểm tra cập nhật từ GitHub, đồng bộ config bundle, tải binary cloudflared.

## Ghi chú vận hành

- Dữ liệu task/user đọc từ Google Sheets qua **service account** (`credentials.json`),
  fallback CSV export công khai (cache 180–300 giây).
- Logtime ghi vào sheet `日報`; time tracker ghi vào `JPメンバー`; cần chia sẻ sheet cho
  service account trong `credentials.json`.
- Thư mục `drive_data/` và `__pycache__/` được tạo tự động, không commit.
- Ảnh album thời tiết lưu ở `static/weather_album/` (Supabase prefix `weather_album/`).
