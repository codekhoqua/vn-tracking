# VN-Tracking

Ứng dụng web nội bộ quản lý tiến độ sản xuất cho team bản địa hoá manga/comic (LinkStory).
Theo dõi task theo tuần, checklist giao nhận, logtime, drive tài nguyên, nghỉ phép và các tiện ích
đồng hành (thú cưng ảo, Lofi Radio, chat team).

- Backend: Python / Flask 3 + Flask-SocketIO
- Frontend: Jinja2, Vanilla CSS, Vanilla JS (không bundler)
- Dữ liệu: Google Sheets (đọc/ghi) + Supabase Storage (trạng thái JSON, drive)
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
| Nghỉ phép | Form nhiều bước, nén & upload ảnh xác nhận lên Google Drive, tạo Calendar event, email admin |
| Tiện ích | Weather + album filmstrip, Lofi Radio (DJ chung, queue, automix), thú cưng 3D |
| Quản trị | Phân quyền member/admin, đổi mật khẩu, cấu hình email nghỉ phép |

## Cấu trúc project

```
.
├── app.py                     # Toàn bộ backend: routes, socket events, tích hợp
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
│   └── PRODUCT.md             # Bối cảnh sản phẩm, người dùng, phạm vi
│
├── scripts/
│   ├── build_docx.py          # Xuất tài liệu PSD từ Notion ra .docx
│   └── convert_fbx_to_glb.py  # Convert model thú cưng FBX → GLB
│
├── integrations/
│   └── google_apps_script.js  # Web App: upload Drive, Calendar, email
│
├── templates/                 # base / login / dashboard / drive / calendar / psd_tool
├── static/                    # css, js, audio, images, models, lottie, weather_album
└── data/                      # Dữ liệu runtime (đơn nghỉ phép, file đính kèm)
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

> Không commit `env_vars.yaml` và `credentials.json`. Nếu các khoá từng bị lộ, hãy rotate
> (Supabase secret, Groq, service account, Cloudflare tunnel).

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

## Scripts

- `scripts/build_docx.py`: cào trang Notion PSD và xuất `.docx` (cần Playwright + python-docx).
- `scripts/convert_fbx_to_glb.py`: convert model FBX sang GLB kèm texture cho thú cưng 3D.
- `sync_master.bat`: kiểm tra cập nhật từ GitHub, đồng bộ config bundle, tải binary cloudflared.

## Ghi chú vận hành

- Dữ liệu task/user đọc từ Google Sheets CSV (cache 180–300 giây).
- Logtime ghi vào sheet `日報`; time tracker ghi vào `JPメンバー`; cần chia sẻ sheet cho
  service account trong `credentials.json`.
- Thư mục `drive_data/` và `__pycache__/` được tạo tự động, không commit.
- Ảnh album thời tiết lưu ở `static/weather_album/` (Supabase prefix `weather_album/`).
