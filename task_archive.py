"""Kho lưu trữ dài hạn (archive) cho VN-Tracking.

Google Sheet của JP chỉ giữ ~3 tuần task, còn comment/checklist nằm trên
Supabase Storage dưới dạng 1 file JSON duy nhất (ghi đè, không lịch sử).
Module này gom tất cả vào 4 bảng append-only trong Turso/SQLite:

    tasks              1 dòng / 1 lượt task nhìn thấy trên sheet
    task_comments      comment của task (có timestamp thật)
    checklist_state    trạng thái tick mới nhất của từng ô
    checklist_events   mỗi lần 1 ô đổi trạng thái
    task_links         link Mikan/Notion/Asana/Dropbox của task
    sync_log           nhật ký mỗi lần đồng bộ

Mọi bảng đều dùng khoá ``hash`` UNIQUE + ``INSERT ... ON CONFLICT DO UPDATE``
nên chạy lại nhiều lần không bị nhân bản, và giữ được ``first_seen_at``.
"""

import csv
import datetime as _dt
import hashlib
import io
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request

from archive_store import ArchiveStoreError, describe_store, get_store

# =====================================================================
# Cấu hình nguồn dữ liệu
# =====================================================================
SHEET_ID = "1ec_v1hsKu0oCOwyrFNgxckpoaq3Q02J4NdIchqbYE3s"

# tên tab -> gid (dùng cho URL export?format=csv)
SHEET_TABS = {
    "Schedule management - ALL": 0,
    "VN-task": 1881594515,
    "After week": 597870203,
    "Data Sort": 857859938,
}

# Danh sách nhân sự VN. Dùng ĐÚNG rule của dashboard (app.py, hàm lấy dữ liệu
# biểu đồ): một dòng là task VN nếu cột ``VN`` có "VN"/"(VN)" **hoặc** cột
# ``作業者`` (người thực hiện) chứa tên nhân sự VN. Nhờ vậy trang lịch sử và
# bảng task hiện tại lọc ra cùng một tập, không lệch nhau.
VN_WORKER_NAMES = ("Tan", "Kim", "Vinh", "Thao", "Hieu", "Tho", "Khuong", "Anh", "Thang")
_VN_WORKER_RE = re.compile("|".join(VN_WORKER_NAMES), re.I)
_VN_FLAG_RE = re.compile(r"vn", re.I)


def is_vn_row(vn_raw, worker):
    """True nếu dòng sheet thuộc team VN."""
    if vn_raw and _VN_FLAG_RE.search(str(vn_raw)):
        return True
    if worker and _VN_WORKER_RE.search(str(worker)):
        return True
    return False


# ---------------------------------------------------------------------
# Quy ước khi XEM lịch sử: mọi "tập + tác phẩm" mà thông tin đã ở TRƯỚC
# tuần trước được coi như xong 100% checklist. Các tập còn nằm trong mục
# "THÔNG TIN TUẦN TRƯỚC" (và tuần này / tuần sau) giữ nguyên trạng thái thật
# vì còn đang làm.
#
# Chú ý: đây chỉ là cách TRÌNH BÀY lúc đọc — không ghi gì vào bảng
# ``checklist_state`` cũng như không đụng tới checklist thật trên Supabase.
# Tắt bằng biến môi trường ``ARCHIVE_OLD_CHECKLIST_100=0``.
# ---------------------------------------------------------------------
OLD_CHECKLIST_100 = os.environ.get("ARCHIVE_OLD_CHECKLIST_100", "1").lower() not in (
    "0", "false", "no", "off")
CHECKLIST_BOXES = 9          # mỗi thẻ có 9 ô checklist (giống dashboard)


def truoc_cutoff(today=None):
    """Thứ Hai của tuần trước = mốc "thông tin tuần trước".

    Ví dụ hôm nay 19/10/2026 (thứ Hai) -> 12/10/2026, đúng bằng khoảng
    ``Monday, October 12, 2026 ➞ Friday, October 16, 2026`` ghi trong tab
    "After week".
    """
    today = today or _dt.date.today()
    return today - _dt.timedelta(days=today.weekday() + 7)


def apply_old_checklist_rule(items, cutoff=None):
    """Ép checklist 100% cho các cặp (tập + tác phẩm) cũ hơn tuần trước.

    Đơn vị là ``volume_key`` ("<tập>_<tác phẩm>"): một tập chỉ được coi là
    "cũ" khi **mọi** task của nó đều có ngày trước thứ Hai tuần trước. Tập nào
    còn task ở tuần trước / tuần này / tuần sau thì để nguyên.
    """
    cutoff_iso = (cutoff or truoc_cutoff()).isoformat()

    latest = {}                       # volume_key -> ngày muộn nhất
    for it in items:
        vk = it.get("volume_key")
        d = str(it.get("end_date") or it.get("start_date") or "")[:10]
        if vk and d and d > latest.get(vk, ""):
            latest[vk] = d

    for it in items:
        vk = it.get("volume_key")
        newest = latest.get(vk)
        if not newest or newest >= cutoff_iso:
            continue                  # còn trong tuần trước trở đi -> không đụng
        it["checklist_assumed"] = True
        it["checked_count"] = CHECKLIST_BOXES
        it["progress"] = 100
        it["status_class"] = "delivered"
        it["checklist"] = {"checked": CHECKLIST_BOXES, "total": CHECKLIST_BOXES,
                           "percent": 100}
    return items

ARCHIVE_SCHEMA = [
    # ---------------- tasks ----------------
    """
    CREATE TABLE IF NOT EXISTS tasks (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        hash          TEXT NOT NULL UNIQUE,
        first_seen_at TEXT NOT NULL,
        last_seen_at  TEXT NOT NULL,
        source        TEXT NOT NULL,
        category      TEXT,
        cong_viec     TEXT,
        job_type      TEXT,
        tac_pham      TEXT NOT NULL,
        volume_key    TEXT,
        tap           TEXT,
        chuong        TEXT,
        page          TEXT,
        pc_staff      TEXT,
        publisher     TEXT,
        start_date    TEXT,
        end_date      TEXT,
        start_raw     TEXT,
        end_raw       TEXT,
        sched_start   TEXT,
        sched_end     TEXT,
        week_year     INTEGER,
        week_no       INTEGER,
        is_vn         INTEGER DEFAULT 0,
        worker        TEXT,
        qc            TEXT,
        status        TEXT,
        progress_flag TEXT,
        note          TEXT
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tasks_tacpham ON tasks (tac_pham)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_volume  ON tasks (volume_key)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_dates   ON tasks (start_date, end_date)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_worker  ON tasks (worker)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_week    ON tasks (week_year, week_no)",
    "CREATE INDEX IF NOT EXISTS idx_tasks_jobtype ON tasks (job_type)",
    # ---------------- comments ----------------
    """
    CREATE TABLE IF NOT EXISTS task_comments (
        comment_id  TEXT PRIMARY KEY,
        hash        TEXT NOT NULL UNIQUE,
        tp_key      TEXT NOT NULL,
        volume_key  TEXT,
        author      TEXT,
        message     TEXT,
        tag         TEXT,
        ts          INTEGER,
        created_at  TEXT,
        first_seen_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_comments_tp     ON task_comments (tp_key)",
    "CREATE INDEX IF NOT EXISTS idx_comments_volume ON task_comments (volume_key)",
    "CREATE INDEX IF NOT EXISTS idx_comments_ts     ON task_comments (ts)",
    # ---------------- checklist state ----------------
    """
    CREATE TABLE IF NOT EXISTS checklist_state (
        tp_key      TEXT NOT NULL,
        volume_key  TEXT,
        box_id      TEXT NOT NULL,
        checked     INTEGER NOT NULL,
        rewarded    INTEGER DEFAULT 0,
        updated_at  TEXT NOT NULL,
        PRIMARY KEY (tp_key, box_id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ckstate_volume ON checklist_state (volume_key)",
    # ---------------- checklist events ----------------
    """
    CREATE TABLE IF NOT EXISTS checklist_events (
        hash       TEXT PRIMARY KEY,
        tp_key     TEXT NOT NULL,
        volume_key TEXT,
        box_id     TEXT NOT NULL,
        checked    INTEGER NOT NULL,
        actor      TEXT,
        changed_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_ckevents_tp ON checklist_events (tp_key, changed_at)",
    # ---------------- task links ----------------
    """
    CREATE TABLE IF NOT EXISTS task_links (
        tp_key     TEXT NOT NULL,
        volume_key TEXT,
        slot       TEXT NOT NULL,
        url        TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (tp_key, slot)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_links_volume ON task_links (volume_key)",
    # ---------------- avatar thành viên ----------------
    """
    CREATE TABLE IF NOT EXISTS user_avatars (
        username   TEXT PRIMARY KEY,
        mime       TEXT NOT NULL,
        data       BLOB NOT NULL,
        updated_at TEXT
    )
    """,
    # ---------------- sync log ----------------
    """
    CREATE TABLE IF NOT EXISTS sync_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        source      TEXT,
        inserted    INTEGER DEFAULT 0,
        updated     INTEGER DEFAULT 0,
        note        TEXT
    )
    """,
]

_schema_ready = False
_schema_lock = threading.Lock()

_COLS = [
    "category", "cong_viec", "job_type", "tac_pham", "volume_key", "tap", "chuong",
    "page", "pc_staff", "publisher", "start_date", "end_date", "start_raw",
    "end_raw", "sched_start", "sched_end", "week_year", "week_no", "is_vn",
    "worker", "qc", "status", "progress_flag", "note",
]


# =====================================================================
# Schema
# =====================================================================
def ensure_schema(store=None):
    """Tạo bảng/index nếu chưa có (idempotent, chỉ chạy 1 lần mỗi process)."""
    global _schema_ready
    if _schema_ready:
        return False
    with _schema_lock:
        if _schema_ready:
            return False
        store = store or get_store()
        for ddl in ARCHIVE_SCHEMA:
            store.execute(ddl)
        _schema_ready = True
        return True


# =====================================================================
# Chuẩn hoá dữ liệu
# =====================================================================
_JOB_PATTERNS = [
    ("Lettering/Retouch", ("写植/ﾚﾀｯﾁ", "写植/レタッチ", "Lettering/Retouch")),
    ("Lettering QC", ("修正", "Lettering QC")),
    ("Lettering", ("写植", "Lettering")),
    ("Retouch", ("レタッチ", "ﾚﾀｯﾁ", "Retouch")),
    ("Prep", ("Prep", "下処理")),
    ("QC", ("QC", "検品")),
]


def normalize_job_type(raw):
    """Chuẩn hoá loại công việc từ chuỗi tiếng Nhật/Việt."""
    text = str(raw or "").strip()
    if not text:
        return "Khác"
    for label, needles in _JOB_PATTERNS:
        for needle in needles:
            if needle in text:
                return label
    return "Khác"


_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_DATE_ISO_RE = re.compile(r"\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b")
_DATE_MD_RE = re.compile(r"(?<!\d)(\d{1,2})[/-](\d{1,2})(?!\d)")
_DATE_MON_RE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*[-/ ]?\s*(\d{1,2})",
    re.I,
)


def _clean_cell(value):
    text = str(value or "").strip()
    if text.lower() in ("nan", "none", "null"):
        return ""
    return text


def parse_sheet_date(raw, default_year=None, today=None):
    """Parse ngày kiểu 'Sep-14 (Mon)', '9/18(Fri)', '2026-09-14', 'September 14, 2026'.

    Trả về ``datetime.date`` hoặc ``None``. Xử lý được mốc giao thừa
    tháng 12 -> tháng 1 bằng cách lùi 1 năm nếu ngày nằm quá xa tương lai.
    """
    text = _clean_cell(raw).replace("\u3000", " ")
    if not text:
        return None
    today = today or _dt.date.today()
    year = default_year or today.year
    text = re.sub(r"\([^)]*\)", " ", text)          # bỏ (Mon), (Fri)
    text = text.replace("　", " ").strip()

    if not text or text in (":", "->", "-", "=>", "::"):
        return None

    day = month = None
    found_year = None

    m = _DATE_ISO_RE.search(text)
    if m:
        found_year, month, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    else:
        m = _DATE_MON_RE.search(text)
        if m:
            month, day = _MONTHS.get(m.group(1).lower()), int(m.group(2))
        else:
            m = _DATE_MD_RE.search(text)
            if m:
                month, day = int(m.group(1)), int(m.group(2))

    if not month or not day or not (1 <= month <= 12) or not (1 <= day <= 31):
        return None

    year = found_year or year
    try:
        parsed = _dt.date(year, month, day)
    except ValueError:
        return None

    # '9/18' không có năm -> nếu vượt quá ~6 tháng trong tương lai thì lùi 1 năm
    if not found_year:
        if (parsed - today).days > 183:
            try:
                parsed = parsed.replace(year=year - 1)
            except ValueError:
                pass
    return parsed


def iso_or_none(d):
    return d.isoformat() if d else None


def week_of(d):
    if not d:
        return (None, None)
    cal = d.isocalendar()
    return (cal[0], cal[1])


def volume_key_of(tap, tac_pham):
    """Khoá 'tập_tác phẩm' giống cách app đang dùng."""
    tap = _clean_cell(tap)
    tac_pham = _clean_cell(tac_pham)
    if tap and tap not in ("-",):
        return f"{tap}_{tac_pham}"
    return tac_pham


def volume_key_from_tp_key(tp_key):
    """Bỏ tiền tố '<công việc> - ' để lấy volume_key."""
    key = str(tp_key or "").strip()
    if " - " in key:
        return key.split(" - ", 1)[1].strip()
    return key


def _hash(*parts):
    raw = "\u241f".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def now_iso():
    return _dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# =====================================================================
# Đọc sheet
# ---------------------------------------------------------------------
# Ưu tiên service account (``credentials.json`` / ``GOOGLE_CREDENTIALS``):
# hoạt động cả khi sheet đã chuyển sang *Restricted*, tức không còn lộ dữ
# liệu qua CSV export công khai. Nếu không có credentials thì fallback về
# CSV export như trước.
# =====================================================================
SHEET_READ_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
    "https://www.googleapis.com/auth/drive.readonly",
]
_gspread_client = None
_gspread_checked = False


def load_credentials_dict():
    """Nạp credentials service account từ file hoặc biến môi trường."""
    base = os.path.dirname(os.path.abspath(__file__))
    for candidate in ("credentials.json", "credentials_vn.json"):
        path = os.path.join(base, candidate)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    return json.load(fh)
            except Exception as exc:
                print(f"task_archive: đọc {candidate} lỗi:", exc)

    raw = (
        os.environ.get("GOOGLE_CREDENTIALS_B64")
        or os.environ.get("GOOGLE_CREDENTIALS")
        or os.environ.get("GOOGLE_SHEETS_CREDENTIALS")
        or ""
    ).strip()
    if not raw:
        return None
    if len(raw) > 1 and raw[0] == raw[-1] and raw[0] in "\"'":
        raw = raw[1:-1].strip()
    if raw.startswith("{"):
        try:
            return json.loads(raw)
        except Exception as exc:
            print("task_archive: parse GOOGLE_CREDENTIALS lỗi:", exc)
            return None
    try:
        import base64
        padded = raw + "=" * (-len(raw) % 4)
        return json.loads(base64.b64decode(padded).decode("utf-8"))
    except Exception as exc:
        print("task_archive: giải mã Base64 credentials lỗi:", exc)
        return None


def get_sheet_client():
    """gspread client dùng lại giữa các lần sync (None nếu không có credentials)."""
    global _gspread_client, _gspread_checked
    if _gspread_checked:
        return _gspread_client
    _gspread_checked = True

    creds_dict = load_credentials_dict()
    if not creds_dict:
        return None
    try:
        import gspread
        from google.oauth2.service_account import Credentials

        if isinstance(creds_dict.get("private_key"), str):
            creds_dict["private_key"] = creds_dict["private_key"].replace("\\n", "\n")
            # cùng bản vá như app.py cho credentials.json hiện tại
            if "EKmHf/h)AgMBAAE" in creds_dict["private_key"]:
                creds_dict["private_key"] = creds_dict["private_key"].replace(
                    "EKmHf/h)AgMBAAE", "EKmHf/gpAgMBAAE"
                )
        creds = Credentials.from_service_account_info(creds_dict, scopes=SHEET_READ_SCOPES)
        _gspread_client = gspread.authorize(creds)
    except Exception as exc:
        print("task_archive: không tạo được gspread client:", exc)
        _gspread_client = None
    return _gspread_client


def fetch_sheet_rows(sheet_id, gid=None, sheet_name=None, timeout=60):
    """Đọc 1 tab -> ``list[list[str]]`` (đã bỏ dòng trống)."""
    client = get_sheet_client()
    if client:
        try:
            spreadsheet = client.open_by_key(sheet_id)
            worksheet = None
            if sheet_name:
                worksheet = spreadsheet.worksheet(sheet_name)
            elif gid is not None:
                try:
                    worksheet = spreadsheet.get_worksheet_by_id(int(gid))
                except Exception:
                    worksheet = None
            worksheet = worksheet or spreadsheet.sheet1
            return [r for r in worksheet.get_all_values() if any(str(c).strip() for c in r)]
        except Exception as exc:
            print(
                f"task_archive: đọc '{sheet_name or gid}' bằng service account lỗi, "
                f"thử CSV công khai: {exc}"
            )

    text = fetch_text(sheet_csv_url(sheet_id, gid=gid, sheet_name=sheet_name), timeout=timeout)
    return rows_from_csv_text(text)


def sheet_csv_url(sheet_id, gid=None, sheet_name=None):
    base = f"https://docs.google.com/spreadsheets/d/{sheet_id}"
    if sheet_name:
        return f"{base}/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(sheet_name)}"
    return f"{base}/export?format=csv&gid={gid}"


def fetch_text(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8-sig", "replace")


def rows_from_csv_text(text):
    return [r for r in csv.reader(io.StringIO(text)) if any(str(c).strip() for c in r)]


def find_col(headers, *needles, exact_lower=False):
    """Tìm index cột theo nhiều cách khớp tên header."""
    lowered = [str(h or "").strip().lower() for h in headers]
    for needle in needles:
        n = needle.lower()
        if exact_lower:
            for i, h in enumerate(lowered):
                if h == n:
                    return i
        else:
            for i, h in enumerate(lowered):
                if n in h:
                    return i
    return None


def canonical_rows_from_sheet(rows, source, snapshot_at, today=None):
    """Chuyển các dòng sheet thô thành dict canonical cho bảng ``tasks``."""
    if len(rows) < 2:
        return []
    headers = rows[0]
    today = today or _dt.date.today()

    idx = {
        "category": find_col(headers, "カテゴリ", "category"),
        "cong_viec": find_col(headers, "作業内容", "công việc", "cong viec"),
        "tac_pham": find_col(headers, "作品名", "tên tác phẩm", "tac pham"),
        "chuong": find_col(headers, "話数", "chương", "chuong"),
        "tap": find_col(headers, "巻数", "tập", "tap"),
        "page": find_col(headers, "page"),
        "pc_staff": find_col(headers, "担当"),
        "publisher": find_col(headers, "出版社", "nxb"),
        "start_raw": find_col(headers, "開始日", "ngày bắt đầu"),
        "end_raw": find_col(headers, "提出日", "納品日", "hạn chót", "deadline", "kết thúc"),
        "sched_start": find_col(headers, "作業日程\n開始日", "作業日程 開始日"),
        "sched_end": find_col(headers, "作業日程\n終了日", "作業日程 終了日"),
        "vn": find_col(headers, "vn"),
        "worker": find_col(headers, "作業者", "người thực hiện"),
        "qc": find_col(headers, "社内qc", "qc"),
        "status": find_col(headers, "ステータス", "trạng thái"),
        "progress_flag": find_col(headers, "開始"),
        "note": find_col(headers, "備考", "ghi chú"),
    }

    out = []
    for row in rows[1:]:
        def get(key):
            i = idx.get(key)
            if i is None or i >= len(row):
                return ""
            return _clean_cell(row[i])

        tac_pham = get("tac_pham")
        if not tac_pham or tac_pham in ("作品名", "Tên tác phẩm"):
            continue
        cong_viec = get("cong_viec")
        tap, chuong = get("tap"), get("chuong")

        start_d = parse_sheet_date(get("start_raw"), today=today)
        end_d = parse_sheet_date(get("end_raw"), today=today)
        if not start_d and end_d:
            start_d = end_d
        if not end_d and start_d:
            end_d = start_d
        if not start_d and not end_d:
            continue  # dòng không có mốc thời gian -> bỏ

        vn_raw = get("vn")
        worker_raw = get("worker")
        is_vn = 1 if is_vn_row(vn_raw, worker_raw) else 0
        week_year, week_no = week_of(start_d or end_d)

        item = {
            "source": source,
            "category": get("category"),
            "cong_viec": cong_viec,
            "job_type": normalize_job_type(cong_viec),
            "tac_pham": tac_pham,
            "volume_key": volume_key_of(tap, tac_pham),
            "tap": tap,
            "chuong": chuong,
            "page": get("page"),
            "pc_staff": get("pc_staff"),
            "publisher": get("publisher"),
            "start_date": iso_or_none(start_d),
            "end_date": iso_or_none(end_d),
            "start_raw": get("start_raw"),
            "end_raw": get("end_raw"),
            "sched_start": get("sched_start"),
            "sched_end": get("sched_end"),
            "week_year": week_year,
            "week_no": week_no,
            "is_vn": is_vn,
            "worker": worker_raw,
            "qc": get("qc"),
            "status": get("status"),
            "progress_flag": get("progress_flag"),
            "note": get("note"),
        }
        item["hash"] = _hash(
            "task", item["tac_pham"], item["tap"], item["chuong"],
            item["job_type"], item["worker"], item["start_date"],
            item["end_date"], item["status"],
        )
        out.append(item)
    return out


# =====================================================================
# Ghi vào DB
# =====================================================================
def _norm_cell(value):
    """Chuẩn hoá 1 ô để so sánh kiểu/giá trị giữa Python và DB."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def save_tasks(items, store=None, snapshot_at=None):
    """Ghi danh sách task canonical vào bảng ``tasks``. Trả về số dòng gửi."""
    items = [it for it in items if it.get("tac_pham")]
    if not items:
        return 0
    store = store or get_store()
    ensure_schema(store)
    snapshot_at = snapshot_at or now_iso()

    cols = ["hash", "first_seen_at", "last_seen_at", "source"] + _COLS
    placeholders = ", ".join("?" for _ in cols)

    def _assign(c):
        if c == "is_vn":
            # Cùng một task có thể tới từ 2 tab (``Schedule management - ALL`` và
            # ``VN-task``) và tab này có thể thiếu cột ``VN``. Đã từng được xác
            # định là task VN thì giữ nguyên, không để lần ghi sau kéo về 0 —
            # nếu không, lịch sử sẽ lúc ẩn lúc hiện tuỳ tab nào ghi sau.
            return "is_vn = MAX(COALESCE(is_vn, 0), COALESCE(excluded.is_vn, 0))"
        return f"{c}=excluded.{c}"

    updates = ", ".join(
        _assign(c) for c in cols if c not in ("hash", "first_seen_at", "source")
    )
    sql = (
        f"INSERT INTO tasks ({', '.join(cols)}) VALUES ({placeholders}) "
        f"ON CONFLICT(hash) DO UPDATE SET {updates}, last_seen_at=excluded.last_seen_at"
    )

    # Bỏ qua dòng KHÔNG đổi: DB ở nước ngoài nên ghi lại 2700 dòng tốn ~60s
    # (mỗi dòng ~20ms), trong khi đọc hết chỉ ~2s. Đọc trước rồi chỉ ghi dòng
    # mới / dòng có thay đổi / dòng cần bật is_vn.
    # Không so sánh cột ``source``: mỗi task xuất hiện ở nhiều tab sheet với
    # source khác nhau, nếu so cả source thì lần sync nào cũng ghi lại ~300 dòng
    # (mỗi dòng ~20ms) mà thông tin không thay đổi gì.
    existing = {}
    try:
        select_cols = ", ".join(["hash"] + _COLS)
        _cols_got, rows_ex = store.execute(f"SELECT {select_cols} FROM tasks")
        for r in rows_ex:
            existing[r[0]] = tuple(_norm_cell(v) for v in r[1:])
    except Exception as exc:  # đọc không được thì ghi như cũ (an toàn)
        print("Không đọc được tasks để so sánh, sẽ ghi toàn bộ:", exc)
        existing = {}

    statements = []
    for it in items:
        args = [it["hash"], snapshot_at, snapshot_at, it.get("source", "")]
        args += [it.get(c) for c in _COLS]
        if existing:
            sig = tuple(_norm_cell(it.get(c)) for c in _COLS)
            if existing.get(it["hash"]) == sig:
                continue
        statements.append((sql, args))

    if statements:
        store.batch(statements)
    return len(statements)


def save_comments(comments_db, store=None, snapshot_at=None):
    """Ghi comment (dict tp_key -> list comment) vào bảng ``task_comments``."""
    store = store or get_store()
    ensure_schema(store)
    snapshot_at = snapshot_at or now_iso()
    sql = (
        "INSERT INTO task_comments "
        "(comment_id, hash, tp_key, volume_key, author, message, tag, ts, created_at, first_seen_at) "
        "VALUES (?,?,?,?,?,?,?,?,?,?) "
        "ON CONFLICT(hash) DO UPDATE SET message=excluded.message, tag=excluded.tag"
    )
    statements = []
    seen = set()
    keep_ids = {}

    # Đọc comment hiện có để bỏ qua dòng không đổi (DB ở nước ngoài: mỗi dòng
    # ghi tốn ~20ms, comment có thể lên tới hàng nghìn dòng).
    existing = {}
    try:
        for r in _fetchall(store, "SELECT hash, message, tag FROM task_comments"):
            existing[r[0]] = (_norm_cell(r[1]), _norm_cell(r[2]))
    except Exception:
        existing = {}

    for tp_key, items in (comments_db or {}).items():
        if not isinstance(items, list):
            continue
        volume_key = volume_key_from_tp_key(tp_key)
        keep_ids.setdefault(tp_key, set())
        for c in items:
            if not isinstance(c, dict):
                continue
            author = _clean_cell(c.get("user"))
            message = str(c.get("message") or "")
            if not message:
                continue
            ts = c.get("timestamp")
            try:
                ts = int(ts)
            except (TypeError, ValueError):
                ts = None
            comment_id = str(c.get("id") or "").strip()
            if not comment_id:
                comment_id = "h_" + _hash(tp_key, author, message, ts)[:20]
            # id có thể trùng giữa các key -> thêm hậu tố
            base_id = comment_id
            n = 1
            while comment_id in seen:
                comment_id = f"{base_id}__{n}"
                n += 1
            seen.add(comment_id)
            keep_ids[tp_key].add(comment_id)
            h = _hash("comment", tp_key, comment_id, author, message, ts)
            created_at = (
                _dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M:%S")
                if ts else None
            )
            tag = _clean_cell(c.get("tag"))
            if existing and existing.get(h) == (_norm_cell(message), _norm_cell(tag)):
                continue
            statements.append((sql, [
                comment_id, h, tp_key, volume_key, author, message,
                tag, ts, created_at, snapshot_at,
            ]))
    if statements:
        store.batch(statements)

    # Xoá những comment đã bị xoá trên UI (chỉ trong các tp_key có mặt).
    deletes = []
    for tp_key, ids in keep_ids.items():
        ids = list(ids)
        if not ids:
            deletes.append(("DELETE FROM task_comments WHERE tp_key = ?", [tp_key]))
            continue
        marks = ", ".join("?" for _ in ids)
        deletes.append((
            f"DELETE FROM task_comments WHERE tp_key = ? AND comment_id NOT IN ({marks})",
            [tp_key] + ids,
        ))
    if deletes:
        store.batch(deletes)
    return len(statements)


def save_checklists(checklists_db, store=None, snapshot_at=None, actor=None):
    """Cập nhật trạng thái tick + ghi event cho những ô THỰC SỰ đổi.

    So sánh với trạng thái đang có trong DB nên chạy lại nhiều lần cũng
    không sinh event rác, và event ghi được đúng người tick (``actor``).
    """
    store = store or get_store()
    ensure_schema(store)
    snapshot_at = snapshot_at or now_iso()

    # 1. Lấy trạng thái hiện có để so sánh
    current = {}
    for r in _fetchall(store, "SELECT tp_key, box_id, checked, rewarded FROM checklist_state"):
        current[(r[0], r[1])] = (_norm_cell(r[2]), _norm_cell(r[3]))

    state_sql = (
        "INSERT INTO checklist_state (tp_key, volume_key, box_id, checked, rewarded, updated_at) "
        "VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(tp_key, box_id) DO UPDATE SET "
        "checked=excluded.checked, rewarded=excluded.rewarded, updated_at=excluded.updated_at"
    )
    state_stmts = []
    event_stmts = []
    changes = 0

    for tp_key, boxes in (checklists_db or {}).items():
        if not isinstance(boxes, dict):
            continue
        volume_key = volume_key_from_tp_key(tp_key)
        rewarded = 1 if boxes.get("_rewarded") else 0
        for box_id, flag in boxes.items():
            if box_id.startswith("_"):
                continue
            checked = 1 if flag else 0
            prev = current.get((tp_key, box_id))
            if prev == (str(checked), str(rewarded)):
                continue  # không đổi -> khỏi ghi (mỗi dòng ghi tốn ~20ms)
            changes += 1
            state_stmts.append((state_sql, [
                tp_key, volume_key, box_id, checked, rewarded, snapshot_at,
            ]))
            event_stmts.append((
                "INSERT INTO checklist_events "
                "(hash, tp_key, volume_key, box_id, checked, actor, changed_at) "
                "VALUES (?,?,?,?,?,?,?) ON CONFLICT(hash) DO NOTHING",
                [
                    _hash("ckevent", tp_key, box_id, checked, snapshot_at),
                    tp_key, volume_key, box_id, checked, actor, snapshot_at,
                ],
            ))

    if state_stmts:
        store.batch(state_stmts)
    if event_stmts:
        store.batch(event_stmts)
    return {"boxes": len(state_stmts), "events": changes}


# ---------------------------------------------------------------------
# Đọc lại state dưới đúng dạng dict mà app.py đang dùng
# ---------------------------------------------------------------------
def get_checklists_dict(store=None):
    """Trả ``{tp_key: {box_id: bool, '_rewarded': bool}}``."""
    store = store or get_store()
    ensure_schema(store)
    out = {}
    for tp_key, box_id, checked, rewarded in _fetchall(
        store, "SELECT tp_key, box_id, checked, rewarded FROM checklist_state"
    ):
        entry = out.setdefault(tp_key, {})
        entry[box_id] = bool(checked)
        if rewarded:
            entry["_rewarded"] = True
    return out


def get_comments_dict(store=None):
    """Trả ``{tp_key: [{id, user, message, tag, time, timestamp}, ...]}``."""
    store = store or get_store()
    ensure_schema(store)
    out = {}
    rows = _fetchall(store, """
        SELECT tp_key, comment_id, author, message, tag, ts, created_at
        FROM task_comments ORDER BY COALESCE(ts, 0) ASC, comment_id ASC
    """)
    for tp_key, comment_id, author, message, tag, ts, created_at in rows:
        time_label = ""
        if ts:
            try:
                time_label = _dt.datetime.fromtimestamp(ts).strftime("%H:%M %d/%m")
            except Exception:
                time_label = ""
        elif created_at:
            time_label = str(created_at)
        out.setdefault(tp_key, []).append({
            "id": comment_id,
            "user": author or "",
            "message": message or "",
            "tag": tag or "chat",
            "time": time_label,
            "timestamp": ts or 0,
        })
    return out


def get_links_dict(store=None):
    """Trả ``{tp_key: {slot: url}}``."""
    store = store or get_store()
    ensure_schema(store)
    out = {}
    for tp_key, slot, url in _fetchall(
        store, "SELECT tp_key, slot, url FROM task_links ORDER BY tp_key, slot"
    ):
        out.setdefault(tp_key, {})[slot] = url
    return out


def delete_comment(comment_id, store=None):
    store = store or get_store()
    ensure_schema(store)
    store.execute("DELETE FROM task_comments WHERE comment_id = ?", [comment_id])
    return True


def save_task_links(links_db, store=None, snapshot_at=None):
    """Ghi link Mikan/Notion/Asana/Dropbox vào bảng ``task_links``."""
    store = store or get_store()
    ensure_schema(store)
    snapshot_at = snapshot_at or now_iso()
    sql = (
        "INSERT INTO task_links (tp_key, volume_key, slot, url, updated_at) VALUES (?,?,?,?,?) "
        "ON CONFLICT(tp_key, slot) DO UPDATE SET url=excluded.url, updated_at=excluded.updated_at"
    )
    statements = []
    keep = {}

    # Đọc link hiện có để bỏ qua dòng không đổi
    existing = {}
    try:
        for r in _fetchall(store, "SELECT tp_key, slot, url FROM task_links"):
            existing[(r[0], r[1])] = _norm_cell(r[2])
    except Exception:
        existing = {}

    for tp_key, links in (links_db or {}).items():
        if not isinstance(links, dict):
            continue
        volume_key = volume_key_from_tp_key(tp_key)
        keep.setdefault(tp_key, set())
        for slot, url in links.items():
            url = str(url or "").strip()
            keep[tp_key].add(str(slot))
            if not url:
                continue
            if existing and existing.get((tp_key, str(slot))) == url:
                continue  # link không đổi
            statements.append((sql, [tp_key, volume_key, str(slot), url, snapshot_at]))
    if statements:
        store.batch(statements)

    # Đồng bộ xoá: slot không còn trong dict thì bỏ khỏi DB.
    deletes = []
    for tp_key, slots in keep.items():
        slots = list(slots)
        if not slots:
            deletes.append(("DELETE FROM task_links WHERE tp_key = ?", [tp_key]))
            continue
        marks = ", ".join("?" for _ in slots)
        deletes.append((
            f"DELETE FROM task_links WHERE tp_key = ? AND slot NOT IN ({marks})",
            [tp_key] + slots,
        ))
    if deletes:
        store.batch(deletes)
    return len(statements)


def log_sync(source, started_at, inserted=0, updated=0, note=None, store=None):
    store = store or get_store()
    ensure_schema(store)
    store.execute(
        "INSERT INTO sync_log (started_at, finished_at, source, inserted, updated, note) "
        "VALUES (?,?,?,?,?,?)",
        [started_at, now_iso(), source, inserted, updated, note],
    )


# =====================================================================
# Truy vấn cho UI / CLI
# =====================================================================
def _fetchall(store, sql, args=()):
    _, rows = store.execute(sql, args)
    return rows


def _fetch_many(store, statements):
    """Chạy nhiều query trong 1 HTTP request (Turso) -> [rows, rows, ...].

    Turso ở nước ngoài: 8 request riêng ~8.5s, gộp 1 request ~0.26s.
    """
    if hasattr(store, "query_many"):
        return [rows for _cols, rows in store.query_many(statements)]
    out = []
    for item in statements:
        sql = item[0]
        args = item[1] if len(item) > 1 else ()
        out.append(_fetchall(store, sql, args))
    return out


def _tap_sort_key(v):
    """Sắp xếp số tập: ưu tiên dạng số (1, 2, 10...) rồi mới tới chuỗi khác."""
    try:
        return (0, float(v), "")
    except (TypeError, ValueError):
        return (1, 0.0, str(v))


def _titles_queries(limit, vn_only, q):
    """Dựng 3 câu query cho trang danh sách tác phẩm (dùng chung cho gộp request)."""
    where = ["is_vn = 1"] if vn_only else []
    args = []
    if q:
        where.append("tac_pham LIKE ?")
        args.append(f"%{q}%")
    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    since = (_dt.date.today() - _dt.timedelta(days=28)).isoformat()

    titles_sql = f"""
        SELECT tac_pham,
               COUNT(DISTINCT COALESCE(NULLIF(tap, ''), '-')) AS tap_count,
               COUNT(*) AS row_count,
               MIN(start_date) AS first_date,
               MAX(COALESCE(end_date, start_date)) AS last_date,
               SUM(CASE WHEN COALESCE(end_date, start_date) >= ? THEN 1 ELSE 0 END)
        FROM tasks
        {where_sql}
        GROUP BY tac_pham
        ORDER BY MAX(COALESCE(end_date, start_date)) DESC
        LIMIT ?
    """
    taps_sql = f"""
        SELECT tac_pham, tap FROM tasks
        {where_sql}
        GROUP BY tac_pham, tap
    """
    count_sql = f"SELECT COUNT(DISTINCT tac_pham) FROM tasks {where_sql}"
    return (
        (titles_sql, [since] + list(args) + [limit]),
        (taps_sql, list(args)),
        (count_sql, list(args)),
    )


def titles_page(store=None, limit=500, vn_only=True, q=None):
    """Danh sách tác phẩm + tổng số, gộp 3 query vào 1 request.

    Trả ``(titles, total)``. Dùng cho ``/api/history/titles``.
    """
    store = store or get_store()
    ensure_schema(store)
    titles_q, taps_q, count_q = _titles_queries(limit, vn_only, q)
    rows, taps_rows, count_rows = _fetch_many(store, [titles_q, taps_q, count_q])

    taps_map = {}
    for tp, tap in taps_rows:
        value = (tap or "").strip()
        if not value or value == "-":
            continue
        taps_map.setdefault(tp, []).append(value)

    titles = [
        {
            "tac_pham": r[0], "tap_count": r[1], "row_count": r[2],
            "first_date": r[3], "last_date": r[4], "recent_count": r[5] or 0,
            "taps": sorted(taps_map.get(r[0], []), key=_tap_sort_key),
        }
        for r in rows
    ]
    total = count_rows[0][0] if count_rows else 0
    return titles, total


def list_titles(store=None, limit=500, vn_only=True, q=None):
    """Danh sách tác phẩm (mặc định chỉ task VN) + số liệu tổng hợp."""
    return titles_page(store=store, limit=limit, vn_only=vn_only, q=q)[0]


def count_titles(store=None, vn_only=True, q=None):
    """Tổng số tác phẩm (không bị giới hạn bởi ``limit``)."""
    return titles_page(store=store, limit=1, vn_only=vn_only, q=q)[1]


def history_for_title(tac_pham, store=None, date_from=None, date_to=None,
                      worker=None, job_type=None, limit=2000, vn_only=True,
                      include_comments=False):
    """Lịch sử task của 1 tác phẩm + số comment + tiến độ checklist.

    ``include_comments=True``: trả thêm toàn bộ comment của tác phẩm, gộp vào
    cùng request tổng hợp (tiết kiệm 1 vòng mạng ~0.26s tới Turso).
    Trả ``items`` hoặc ``(items, comments)``.
    """
    store = store or get_store()
    ensure_schema(store)

    where = ["tac_pham = ?"]
    args = [tac_pham]
    if vn_only:
        where.append("is_vn = 1")
    if date_from:
        where.append("COALESCE(end_date, start_date) >= ?")
        args.append(date_from)
    if date_to:
        where.append("COALESCE(start_date, end_date) <= ?")
        args.append(date_to)
    if worker:
        where.append("worker LIKE ?")
        args.append(f"%{worker}%")
    if job_type:
        where.append("job_type = ?")
        args.append(job_type)
    args.append(limit)

    rows = _fetchall(store, f"""
        SELECT volume_key, tap, chuong, job_type, cong_viec, worker, qc, status,
               start_date, end_date, start_raw, end_raw, publisher, note,
               source, first_seen_at, last_seen_at, is_vn
        FROM tasks
        WHERE {' AND '.join(where)}
        ORDER BY COALESCE(start_date, end_date) ASC, tap ASC, chuong ASC
        LIMIT ?
    """, args)

    items = []
    for r in rows:
        volume_key = r[0]
        cong_viec = r[4]
        items.append({
            "volume_key": volume_key, "tap": r[1], "chuong": r[2], "job_type": r[3],
            "cong_viec": cong_viec, "worker": r[5], "qc": r[6], "status": r[7],
            "start_date": r[8], "end_date": r[9], "start_raw": r[10],
            "end_raw": r[11], "publisher": r[12], "note": r[13],
            "source": r[14], "first_seen_at": r[15], "last_seen_at": r[16],
            "is_vn": bool(r[17]),
            # Khoá checklist = "<công việc> - <tập>", ví dụ "写植 - 8_いぶり暮らし"
            "tp_key": (f"{cong_viec} - {volume_key}" if (cong_viec and volume_key) else (volume_key or "")),
        })

    # Gom comment + checklist.
    #   - Comment gắn theo TẬP (volume_key).
    #   - Checklist gắn theo THẺ = "<công việc> - <tập>" (vì 写植 và レタッチ của
    #     cùng một tập là 2 checklist riêng, mỗi cái 9 ô) — nếu gộp theo tập thì
    #     tiến độ sẽ bị cộng dồn sai (vượt 100%).
    tp_keys = [i["tp_key"] for i in items if i.get("tp_key")]
    vkeys = list({i["volume_key"] for i in items if i["volume_key"]})
    comments = {}
    progress = {}
    # Gộp mọi query tổng hợp vào 1 request (Turso: ~0.26s thay vì nhiều request)
    agg = []
    agg_plan = []
    if tp_keys:
        marks = ", ".join("?" for _ in tp_keys)
        agg.append((f"""
            SELECT tp_key, SUM(checked), COUNT(*) FROM checklist_state
            WHERE tp_key IN ({marks})
            GROUP BY tp_key
        """, tp_keys))
        agg_plan.append("progress")
    if vkeys:
        marks = ", ".join("?" for _ in vkeys)
        agg.append((f"""
            SELECT volume_key, COUNT(*) FROM task_comments
            WHERE volume_key IN ({marks}) GROUP BY volume_key
        """, vkeys))
        agg_plan.append("comment_count")
    if include_comments:
        like = f"%_{tac_pham}"
        agg.append(("""
            SELECT created_at, author, message, tag, ts, volume_key, tp_key
            FROM task_comments
            WHERE volume_key = ? OR volume_key LIKE ? OR tp_key = ? OR tp_key LIKE ?
            ORDER BY ts ASC LIMIT ?
        """, [tac_pham, like, tac_pham, like, 1000]))
        agg_plan.append("comments")

    comments_list = []
    if agg:
        agg_rows = _fetch_many(store, agg)
        for kind, part_rows in zip(agg_plan, agg_rows):
            if kind == "progress":
                for r in part_rows:
                    total = r[2] or 0
                    checked = r[1] or 0
                    progress[r[0]] = {
                        "checked": checked, "total": total,
                        "percent": min(100, int(checked / CHECKLIST_BOXES * 100)) if total else 0,
                    }
            elif kind == "comment_count":
                for r in part_rows:
                    comments[r[0]] = r[1]
            elif kind == "comments":
                comments_list = [
                    {"created_at": r[0], "author": r[1], "message": r[2],
                     "tag": r[3], "ts": r[4], "volume_key": r[5], "tp_key": r[6]}
                    for r in part_rows
                ]

    for i in items:
        vk = i["volume_key"]
        i["comments_count"] = comments.get(vk, 0)
        prog = progress.get(i["tp_key"])
        i["checklist"] = prog
        # Trạng thái suy ra từ checklist, giống dashboard: 0 ô = chưa bắt đầu,
        # >= 9 ô = đã giao hàng, còn lại = đang làm (checklist có 9 ô / thẻ).
        checked = (prog or {}).get("checked", 0) or 0
        if checked <= 0:
            i["status_class"] = "not-started"
        elif checked >= CHECKLIST_BOXES:
            i["status_class"] = "delivered"
        else:
            i["status_class"] = "in-progress"
        i["checked_count"] = checked
        i["progress"] = min(100, int(checked / CHECKLIST_BOXES * 100))

    # Quy ước xem lịch sử: tập cũ hơn tuần trước coi như xong 100%.
    if OLD_CHECKLIST_100:
        apply_old_checklist_rule(items)
    if include_comments:
        return items, comments_list
    return items


def task_detail(tac_pham, tp_key=None, volume_key=None, store=None):
    """Đủ dữ liệu để vẽ trang chi tiết của 1 thẻ (công việc + tập).

    Dùng cho trang /history: bấm vào thẻ Kanban sẽ mở đúng trang chi tiết như
    tab Task của dashboard, nhưng ở chế độ chỉ đọc.

    Trả về dict ``{task, tp_key, volume_key, checked_ids, checklist_assumed,
    links, comments}`` hoặc ``None`` nếu không có dòng nào.
    """
    store = store or get_store()
    ensure_schema(store)

    where = ["tac_pham = ?"]
    args = [tac_pham]
    if volume_key:
        where.append("volume_key = ?")
        args.append(volume_key)

    rows = _fetchall(store, f"""
        SELECT category, cong_viec, job_type, volume_key, tap, chuong, page,
               pc_staff, publisher, start_date, end_date, start_raw, end_raw,
               sched_start, sched_end, week_year, week_no, worker, qc, status,
               progress_flag, note, source, first_seen_at, last_seen_at, is_vn
        FROM tasks
        WHERE {' AND '.join(where)}
        ORDER BY COALESCE(start_date, end_date) ASC, tap ASC
    """, args)

    items = []
    for r in rows:
        cv, vk = r[1], r[3]
        items.append({
            "category": r[0], "cong_viec": cv, "job_type": r[2], "tac_pham": tac_pham,
            "volume_key": vk, "tap": r[4], "chuong": r[5], "page": r[6],
            "pc_staff": r[7], "publisher": r[8], "start_date": r[9], "end_date": r[10],
            "start_raw": r[11], "end_raw": r[12], "sched_start": r[13], "sched_end": r[14],
            "week_year": r[15], "week_no": r[16], "worker": r[17], "qc": r[18],
            "status": r[19], "progress_flag": r[20], "note": r[21], "source": r[22],
            "first_seen_at": r[23], "last_seen_at": r[24], "is_vn": bool(r[25]),
            "tp_key": (f"{cv} - {vk}" if (cv and vk) else (vk or "")),
        })
    if not items:
        return None

    # Quy ước lịch sử phải xét trên TOÀN BỘ dòng của tập (không phải 1 dòng lẻ),
    # nếu không một dòng cũ sót lại sẽ bị ép 100% dù tập vẫn đang làm.
    if OLD_CHECKLIST_100:
        apply_old_checklist_rule(items)

    task = items[0]
    if tp_key:
        for it in items:
            if it["tp_key"] == tp_key:
                task = it
                break
    key = task["tp_key"]
    vk = task["volume_key"]
    assumed = bool(task.get("checklist_assumed"))

    # 3 query độc lập (ô checklist / link / comment) -> gửi chung 1 request
    batch = []
    if not assumed:
        batch.append((
            "SELECT box_id FROM checklist_state WHERE tp_key = ? AND checked = 1",
            [key],
        ))
    if key:
        batch.append(("SELECT slot, url FROM task_links WHERE tp_key = ?", [key]))
    if vk:
        batch.append(("""
            SELECT comment_id, author, message, tag, ts, created_at, tp_key
            FROM task_comments WHERE volume_key = ? ORDER BY ts ASC
        """, [vk]))

    box_rows, link_rows, comment_rows = [], [], []
    if batch:
        res = _fetch_many(store, batch)
        idx = 0
        if not assumed:
            box_rows = res[idx]
            idx += 1
        if key:
            link_rows = res[idx]
            idx += 1
        if vk:
            comment_rows = res[idx]

    if assumed:
        # thẻ cũ: coi như đã tick đủ 9 ô cho khớp với thẻ Kanban
        checked_ids = [f"t{i}" for i in range(1, CHECKLIST_BOXES + 1)]
    else:
        checked_ids = [r[0] for r in box_rows]

    links = {}
    for r in link_rows:
        if r[1]:
            links[r[0]] = r[1]

    comments = [
        {"comment_id": r[0], "author": r[1], "message": r[2], "tag": r[3],
         "ts": r[4], "created_at": r[5], "tp_key": r[6]}
        for r in comment_rows
    ]

    return {
        "task": task, "tp_key": key, "volume_key": vk,
        "checked_ids": checked_ids, "checklist_assumed": assumed,
        "links": links, "comments": comments,
    }


def worker_names(store=None):
    """Danh sách người làm (gộp từ mọi dòng task) — cho ô chọn trong form."""
    store = store or get_store()
    ensure_schema(store)
    names = set()
    for r in _fetchall(store, "SELECT DISTINCT worker FROM tasks WHERE worker IS NOT NULL"):
        for part in str(r[0] or "").split(","):
            p = part.strip()
            if p and p.lower() not in ("nan", "none", "-"):
                names.add(p)
    return sorted(names)


def all_comments_for_title(tac_pham, store=None, limit=1000):
    """Toàn bộ comment thuộc mọi biến thể key của 1 tác phẩm."""
    store = store or get_store()
    ensure_schema(store)
    like = f"%_{tac_pham}"
    rows = _fetchall(store, """
        SELECT created_at, author, message, tag, ts, volume_key, tp_key
        FROM task_comments
        WHERE volume_key = ? OR volume_key LIKE ? OR tp_key = ? OR tp_key LIKE ?
        ORDER BY ts ASC LIMIT ?
    """, [tac_pham, like, tac_pham, like, limit])
    return [
        {"created_at": r[0], "author": r[1], "message": r[2], "tag": r[3], "ts": r[4],
         "volume_key": r[5], "tp_key": r[6]}
        for r in rows
    ]


def stats(store=None):
    store = store or get_store()
    ensure_schema(store)
    tables = ("tasks", "task_comments", "checklist_state",
              "checklist_events", "task_links")
    out = {}
    # 7 query đếm/thống kê -> gộp vào 1 request (Turso: ~0.26s thay vì ~9s)
    results = _fetch_many(store, [
        *[(f"SELECT COUNT(*) FROM {t}", ()) for t in tables],
        ("SELECT MIN(start_date), MAX(COALESCE(end_date, start_date)) FROM tasks", ()),
        ("SELECT COUNT(*), COUNT(DISTINCT tac_pham) FROM tasks WHERE is_vn = 1", ()),
        ("SELECT MIN(start_date), MAX(COALESCE(end_date, start_date)) FROM tasks WHERE is_vn = 1", ()),
    ])
    for table, rows in zip(tables, results):
        out[table] = rows[0][0] if rows else 0
    rows = results[len(tables)]
    if rows:
        out["date_range"] = [rows[0][0], rows[0][1]]
    rows = results[len(tables) + 1]
    if rows:
        out["vn_tasks"], out["vn_titles"] = rows[0][0], rows[0][1]
    rows = results[len(tables) + 2]
    if rows:
        out["vn_date_range"] = [rows[0][0], rows[0][1]]
    out.update(describe_store())
    return out


# =====================================================================
# Đồng bộ tổng hợp (dùng cho CLI + background sync trong app)
# =====================================================================
def sync_sheets(sheet_id=SHEET_ID, tabs=None, store=None,
                progress=None, include_after_week=True):
    """Kéo các tab sheet và ghi vào archive. Trả về thống kê."""
    store = store or get_store()
    ensure_schema(store)
    tabs = tabs or ["Schedule management - ALL", "VN-task"]
    started = now_iso()
    per_tab = {}
    today = _dt.date.today()

    # Gộp các tab lại theo ``hash`` trước khi ghi: cùng một task xuất hiện ở
    # cả tab ALL lẫn VN-task nhưng lệch vài ô (category/pc_staff/sched_*).
    # Nếu ghi từng tab riêng thì lần sync nào 2 tab cũng ghi đè nhau ~300 dòng
    # (mỗi dòng ~20ms) mà dữ liệu vẫn nhảy qua lại.
    merged = {}
    for name in tabs:
        gid = SHEET_TABS.get(name)
        try:
            rows = fetch_sheet_rows(sheet_id, gid=gid)
        except Exception as exc:
            per_tab[name] = {"error": str(exc)}
            if progress:
                progress(f"  ! {name}: {exc}")
            continue
        items = canonical_rows_from_sheet(rows, name, started, today=today)
        for it in items:
            h = it.get("hash")
            if not h:
                continue
            cur = merged.get(h)
            if cur is None:
                merged[h] = dict(it)
                continue
            # giữ giá trị không rỗng; is_vn = 1 nếu bất kỳ tab nào đánh dấu VN
            for c in _COLS:
                if not _norm_cell(cur.get(c)) and _norm_cell(it.get(c)):
                    cur[c] = it.get(c)
            if _norm_cell(it.get("is_vn")) == "1":
                cur["is_vn"] = 1
            if it.get("source"):
                cur["source"] = it.get("source")
        per_tab[name] = {"rows": len(rows), "items": len(items)}
        if progress:
            progress(f"  {name}: {len(rows)} dòng -> {len(items)} task")

    n = save_tasks(list(merged.values()), store=store, snapshot_at=started)
    if progress:
        progress(f"  -> lưu {n} dòng (đã gộp {len(merged)} task)")

    log_sync("sheets", started, inserted=n, store=store)
    return {"saved": n, "merged": len(merged), "tabs": per_tab, "started_at": started}


def sync_supabase_state(url, key, bucket="drive", store=None, progress=None):
    """Kéo các file state JSON trên Supabase Storage và ghi vào archive."""
    store = store or get_store()
    ensure_schema(store)
    started = now_iso()
    result = {}

    def download(path):
        req = urllib.request.Request(
            f"{url.rstrip('/')}/storage/v1/object/{bucket}/{path}",
            headers={"Authorization": f"Bearer {key}", "apikey": key},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))

    jobs = [
        ("_system/checklists.json", save_checklists),
        ("_system/task_comments.json", save_comments),
        ("_system/task_links.json", save_task_links),
    ]
    for path, saver in jobs:
        try:
            data = download(path)
        except Exception as exc:
            result[path] = {"error": str(exc)}
            if progress:
                progress(f"  ! {path}: {exc}")
            continue
        n = saver(data, store=store, snapshot_at=started)
        if isinstance(n, dict):
            result[path] = n
        else:
            result[path] = {"saved": n}
        if progress:
            progress(f"  {path}: {result[path]}")

    def _count(entry):
        if not isinstance(entry, dict):
            return 0
        return entry.get("saved") or entry.get("boxes") or 0

    log_sync("supabase", started, inserted=sum(
        _count(v) for v in result.values()
    ), store=store)
    return result


def migrate_from_env(store=None, progress=None):
    """Đọc URL/key Supabase từ biến môi trường rồi kéo toàn bộ state."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (os.environ.get("SUPABASE_SECRET_KEY")
           or os.environ.get("SUPABASE_SERVICE_KEY", "")).strip()
    bucket = os.environ.get("SUPABASE_BUCKET", "drive")
    if not url or not key:
        return {"skipped": "Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY"}
    return sync_supabase_state(url, key, bucket=bucket, store=store, progress=progress)


# =====================================================================
# Avatar thành viên - lưu thẳng vào DB (không cần Google Drive)
# =====================================================================
AVATAR_MAX_BYTES = 3 * 1024 * 1024
_AVATAR_CACHE = {}
_AVATAR_CACHE_LOCK = threading.Lock()
AVATAR_CACHE_TTL = 3600


def _avatar_cache_drop(username=None):
    with _AVATAR_CACHE_LOCK:
        if username:
            _AVATAR_CACHE.pop((username or "").strip(), None)
        else:
            _AVATAR_CACHE.clear()


def _avatar_magic_mime(data):
    """Đoán mime từ magic bytes của ảnh (None nếu không phải ảnh)."""
    if not data:
        return None
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if data[:2] == b"BM":
        return "image/bmp"
    return None


def _normalize_avatar_blob(mime, data):
    """Chuẩn hoá avatar đọc từ DB.

    Một số bản ghi cũ lưu ảnh dưới dạng **chuỗi base64** (text) thay vì blob
    nhị phân -> trình duyệt nhận chuỗi đó, không vẽ được và rơi về chữ cái đầu
    (đúng lỗi "mất avatar" của Hieu/Anh/Khuong...). Ở đây tự nhận biết và giải mã.
    """
    if isinstance(data, memoryview):
        data = bytes(data)
    if isinstance(data, str):
        data = data.encode("utf-8", "ignore")
    data = bytes(data or b"")
    if not data:
        return (mime or "image/jpeg"), b""
    real_mime = _avatar_magic_mime(data)
    if real_mime:
        return real_mime, data
    # Chỉ thử base64 khi nội dung là ASCII in được (tránh decode bừa blob lạ).
    head = data[:128]
    if all(32 <= b < 127 or b in (9, 10, 13, 61) for b in head):
        import base64
        compact = b"".join(data.split())
        pad = (-len(compact)) % 4
        if pad:
            compact += b"=" * pad
        try:
            decoded = base64.b64decode(compact, validate=False)
        except Exception:
            decoded = b""
        decoded_mime = _avatar_magic_mime(decoded)
        if decoded_mime:
            return decoded_mime, decoded
    return (mime or "image/jpeg"), data


def save_user_avatar(username, data, mime="image/jpeg"):
    """Lưu/ghi đè avatar của 1 user. ``data`` là bytes của ảnh."""
    username = (username or "").strip()
    if not username:
        raise ValueError("Thiếu username")
    if not data:
        raise ValueError("File ảnh rỗng")
    mime, payload = _normalize_avatar_blob(mime, data)
    if not payload:
        raise ValueError("File ảnh rỗng")
    if len(payload) > AVATAR_MAX_BYTES:
        raise ValueError("Ảnh quá lớn (tối đa 3MB)")
    store = get_store()
    ensure_schema(store)
    store.execute(
        "INSERT INTO user_avatars (username, mime, data, updated_at) "
        "VALUES (?, ?, ?, ?) "
        "ON CONFLICT(username) DO UPDATE SET "
        "mime=excluded.mime, data=excluded.data, updated_at=excluded.updated_at",
        (username, mime or "image/jpeg", bytes(payload), now_iso()),
    )
    _avatar_cache_drop(username)
    return True


def get_user_avatar(username):
    """Trả {"mime", "data"} hoặc None nếu user chưa có avatar trong DB.

    Ảnh nằm trong Turso (nước ngoài) nên mỗi lần lấy tốn ~0.3-0.6s; trang nào
    cũng có 8 avatar -> cache trong RAM để hiện tức thì.
    """
    username = (username or "").strip()
    if not username:
        return None
    now = time.time()
    with _AVATAR_CACHE_LOCK:
        hit = _AVATAR_CACHE.get(username)
        if hit and (now - hit["at"]) < AVATAR_CACHE_TTL:
            return {"mime": hit["mime"], "data": hit["data"]}

    store = get_store()
    ensure_schema(store)
    _cols, rows = store.execute(
        "SELECT mime, data FROM user_avatars WHERE username = ?", (username,))
    if not rows:
        return None
    mime, data = rows[0][0], rows[0][1]
    mime, data = _normalize_avatar_blob(mime, data)
    with _AVATAR_CACHE_LOCK:
        _AVATAR_CACHE[username] = {"mime": mime, "data": data, "at": now}
        if len(_AVATAR_CACHE) > 64:
            oldest = sorted(_AVATAR_CACHE.items(), key=lambda kv: kv[1]["at"])[:32]
            for k, _v in oldest:
                _AVATAR_CACHE.pop(k, None)
    return {"mime": mime, "data": data}


def list_avatar_users(store=None):
    """Danh sách username đang có avatar trong DB (để nạp sẵn cache)."""
    store = store or get_store()
    ensure_schema(store)
    _cols, rows = store.execute("SELECT username FROM user_avatars")
    return [r[0] for r in rows]


def delete_user_avatar(username):
    store = get_store()
    ensure_schema(store)
    store.execute("DELETE FROM user_avatars WHERE username = ?",
                  ((username or "").strip(),))
    _avatar_cache_drop(username)
    return True
